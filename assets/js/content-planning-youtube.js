import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const GANIT_SETU_CHANNEL_ID =
  "UCyMSMFZVFfl5RWWOpLlHSRQ";

const GANIT_SETU_HANDLE =
  "@ganitsetuofficial";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY");

    const googleClientId =
      Deno.env.get("GOOGLE_CLIENT_ID");

    const googleClientSecret =
      Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !googleClientId ||
      !googleClientSecret
    ) {
      throw new Error(
        "Required environment secrets are missing."
      );
    }

    const authClient = createClient(
      supabaseUrl,
      anonKey || "",
      {
        global: {
          headers: {
            Authorization:
              req.headers.get("Authorization") || "",
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return json(
        {
          ok: false,
          error: "Admin user authenticated नहीं है।",
        },
        401
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    const body = await req.json();

    // --------------------------------------------------
    // NO URL SYSTEM
    // Browser sends only internal Storage bucket/path.
    // --------------------------------------------------

    const storageBucket =
      String(
        body.storage_bucket || "home-banners"
      ).trim();

    const storagePath =
      String(
        body.storage_path || ""
      ).trim();

    if (!storagePath) {
      throw new Error(
        "Video Storage path नहीं मिला।"
      );
    }

    if (
      storagePath.includes("..") ||
      storagePath.startsWith("/")
    ) {
      throw new Error(
        "Invalid Storage path."
      );
    }

    const title =
      String(
        body.title || "Ganit Setu"
      ).trim();

    const description =
      String(
        body.description || ""
      );

    const tags =
      Array.isArray(body.tags)
        ? body.tags
            .map((x: unknown) => String(x))
            .filter(Boolean)
            .slice(0, 500)
        : [];

    const privacyStatus =
      ["public", "private", "unlisted"].includes(
        body.privacy_status
      )
        ? body.privacy_status
        : "private";

    // --------------------------------------------------
    // GET GANIT SETU YOUTUBE ACCOUNT
    // --------------------------------------------------

    const {
      data: account,
      error: accountError,
    } =
      await supabaseAdmin
        .from("youtube_accounts")
        .select(`
          id,
          user_id,
          channel_id,
          channel_name,
          channel_handle,
          access_token,
          refresh_token,
          token_expires_at,
          status
        `)
        .eq("user_id", user.id)
        .eq("channel_id", GANIT_SETU_CHANNEL_ID)
        .eq("status", "connected")
        .maybeSingle();

    if (accountError) {
      throw new Error(
        `YouTube account lookup failed: ${accountError.message}`
      );
    }

    if (!account) {
      throw new Error(
        `Ganit Setu YouTube account connected नहीं है। ${GANIT_SETU_HANDLE} को पहले connect करें।`
      );
    }

    if (!account.refresh_token) {
      throw new Error(
        "YouTube refresh token उपलब्ध नहीं है। YouTube को दोबारा connect करना होगा।"
      );
    }

    // --------------------------------------------------
    // REFRESH ACCESS TOKEN WHEN REQUIRED
    // --------------------------------------------------

    let accessToken =
      account.access_token;

    const expiryTime =
      account.token_expires_at
        ? new Date(
            account.token_expires_at
          ).getTime()
        : 0;

    const tokenNeedsRefresh =
      !accessToken ||
      !expiryTime ||
      expiryTime <= Date.now() + 120000;

    if (tokenNeedsRefresh) {
      const refreshResponse =
        await fetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded",
            },
            body:
              new URLSearchParams({
                client_id:
                  googleClientId,
                client_secret:
                  googleClientSecret,
                refresh_token:
                  account.refresh_token,
                grant_type:
                  "refresh_token",
              }),
          }
        );

      const refreshData =
        await refreshResponse.json();

      if (!refreshResponse.ok) {
        throw new Error(
          `YouTube token refresh failed: ${
            refreshData.error_description ||
            refreshData.error ||
            JSON.stringify(refreshData)
          }`
        );
      }

      accessToken =
        refreshData.access_token;

      if (!accessToken) {
        throw new Error(
          "Google ने नया access token नहीं दिया।"
        );
      }

      const expiresIn =
        Number(
          refreshData.expires_in || 3600
        );

      await supabaseAdmin
        .from("youtube_accounts")
        .update({
          access_token:
            accessToken,
          token_expires_at:
            new Date(
              Date.now() +
              expiresIn * 1000
            ).toISOString(),
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", account.id);
    }

    // --------------------------------------------------
    // READ VIDEO DIRECTLY FROM SUPABASE STORAGE
    // NO PUBLIC URL
    // --------------------------------------------------

    const {
      data: videoFile,
      error: downloadError,
    } =
      await supabaseAdmin.storage
        .from(storageBucket)
        .download(storagePath);

    if (downloadError || !videoFile) {
      throw new Error(
        `Supabase Storage से video पढ़ा नहीं जा सका: ${
          downloadError?.message || "file not found"
        }`
      );
    }

    const videoBuffer =
      await videoFile.arrayBuffer();

    const videoSize =
      videoBuffer.byteLength;

    if (!videoSize) {
      throw new Error(
        "Video file खाली है।"
      );
    }

    const contentType =
      videoFile.type ||
      "video/mp4";

    // --------------------------------------------------
    // YOUTUBE UPLOAD SESSION
    // --------------------------------------------------

    const metadata = {
      snippet: {
        title:
          title.substring(0, 100),

        description:
          description.substring(0, 5000),

        tags,

        categoryId: "22",
      },

      status: {
        privacyStatus,

        selfDeclaredMadeForKids:
          false,
      },
    };

    const uploadInitResponse =
      await fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "Content-Type":
              "application/json; charset=UTF-8",

            "X-Upload-Content-Length":
              String(videoSize),

            "X-Upload-Content-Type":
              contentType,
          },

          body:
            JSON.stringify(metadata),
        }
      );

    if (!uploadInitResponse.ok) {
      const errorText =
        await uploadInitResponse.text();

      throw new Error(
        `YouTube upload session create failed: ${errorText}`
      );
    }

    const uploadUrl =
      uploadInitResponse.headers.get(
        "location"
      );

    if (!uploadUrl) {
      throw new Error(
        "YouTube ने upload URL नहीं दिया।"
      );
    }

    // --------------------------------------------------
    // SEND VIDEO BYTES
    // --------------------------------------------------

    const uploadResponse =
      await fetch(
        uploadUrl,
        {
          method: "PUT",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "Content-Type":
              contentType,

            "Content-Length":
              String(videoSize),

            "Content-Range":
              `bytes 0-${videoSize - 1}/${videoSize}`,
          },

          body:
            videoBuffer,
        }
      );

    const uploadText =
      await uploadResponse.text();

    if (!uploadResponse.ok) {
      throw new Error(
        `YouTube video upload failed (${uploadResponse.status}): ${uploadText}`
      );
    }

    let uploadData: any = {};

    try {
      uploadData =
        JSON.parse(uploadText);
    } catch {
      uploadData = {};
    }

    const videoId =
      uploadData.id;

    if (!videoId) {
      throw new Error(
        `YouTube upload हुआ लेकिन video ID नहीं मिली: ${uploadText}`
      );
    }

    // --------------------------------------------------
    // SUCCESS
    // --------------------------------------------------

    return json({
      ok: true,

      message:
        "YouTube पर video successfully publish हो गया।",

      channel_id:
        GANIT_SETU_CHANNEL_ID,

      channel_name:
        account.channel_name,

      video_id:
        videoId,

      // This is ONLY the final YouTube result link.
      // Admin never enters a media URL.
      video_url:
        `https://www.youtube.com/watch?v=${videoId}`,

      title,

      privacy_status:
        privacyStatus,
    });

  } catch (error) {
    console.error(
      "youtube-publish error:",
      error
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    );
  }
});

function json(
  data: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        ...corsHeaders,

        "Content-Type":
          "application/json; charset=utf-8",
      },
    }
  );
}
