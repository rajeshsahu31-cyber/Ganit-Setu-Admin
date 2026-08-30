// ============================================
// GANIT SETU ADMIN - TEACHER MANAGEMENT
// LIVE SUPABASE DATA
// ============================================

const SUPABASE_URL = "https://cbgojvnbkosdehvwerth.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";


const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);


let allTeachers = [];


document.addEventListener(
  "DOMContentLoaded",
  () => {

    document
      .getElementById("teacherSearch")
      .addEventListener(
        "input",
        filterTeachers
      );


    loadTeachers();

  }
);


// ============================================
// Load Teachers
// ============================================

async function loadTeachers() {

  const teacherList =
    document.getElementById("teacherList");


  teacherList.innerHTML = `

    <div class="loading-box">

      ⏳ शिक्षकों की जानकारी लोड हो रही है...

    </div>

  `;


  try {

    const {
      data,
      error
    } = await supabaseClient

      .from("teachers")

      .select(`
        id,
        teacher_number,
        teacher_id,
        full_name,
        mobile,
        school_name,
        school_dise_code,
        district,
        block,
        state,
        status,
        created_at
      `)

      .order(
        "teacher_number",
        {
          ascending: true
        }
      );


    if (error) throw error;


    allTeachers = data || [];


    document.getElementById(
      "teacherCount"
    ).textContent =
      allTeachers.length;


    renderTeachers(allTeachers);


  } catch (error) {

    console.error(
      "Admin Teachers Load Error:",
      error
    );


    teacherList.innerHTML = `

      <div class="error-box">

        ❌ शिक्षकों की जानकारी लोड नहीं हो सकी।

        <br><br>

        ${escapeHtml(error.message || "Unknown Error")}

      </div>

    `;

  }

}


// ============================================
// Search Teachers
// ============================================

function filterTeachers() {

  const query =
    String(
      document.getElementById(
        "teacherSearch"
      ).value || ""
    )
      .trim()
      .toLowerCase();


  const filteredTeachers =
    allTeachers.filter(teacher => {


      const searchableText = [

        teacher.teacher_id,
        teacher.full_name,
        teacher.mobile,
        teacher.school_name,
        teacher.school_dise_code,
        teacher.district,
        teacher.block

      ]

        .join(" ")

        .toLowerCase();


      return searchableText.includes(query);

    });


  renderTeachers(filteredTeachers);


  document.getElementById(
    "teacherCount"
  ).textContent =
    filteredTeachers.length;

}


// ============================================
// Render Teachers
// ============================================

function renderTeachers(teachers) {

  const teacherList =
    document.getElementById("teacherList");


  if (!teachers.length) {

    teacherList.innerHTML = `

      <div class="empty-box">

        👩‍🏫 कोई शिक्षक नहीं मिला।

      </div>

    `;

    return;

  }


  teacherList.innerHTML =
    teachers.map(teacher => {


      const status =
        String(
          teacher.status || "active"
        ).toLowerCase();


      const statusText =
        status === "active"
          ? "सक्रिय"
          : "निष्क्रिय";


      const statusClass =
        status === "active"
          ? "status-active"
          : "status-inactive";


      return `

        <div class="teacher-row">


          <span>

            <b>

              ${escapeHtml(
                teacher.teacher_id || "—"
              )}

            </b>

          </span>


          <span>

            <b>

              ${escapeHtml(
                teacher.full_name || "—"
              )}

            </b>

            <br>

            <small>

              📍 ${escapeHtml(
                teacher.district || "—"
              )}

              ${teacher.block
                ? " • " + escapeHtml(teacher.block)
                : ""
              }

            </small>

          </span>


          <span>

            ${escapeHtml(
              teacher.mobile || "—"
            )}

          </span>


          <span>

            ${escapeHtml(
              teacher.school_name || "—"
            )}

          </span>


          <span>

            ${escapeHtml(
              teacher.school_dise_code || "—"
            )}

          </span>


          <span class="${statusClass}">

            ${statusText}

          </span>


        </div>

      `;

    }).join("");

}


// ============================================
// HTML Escape
// ============================================

function escapeHtml(value) {

  return String(value ?? "")

    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;")

    .replace(/"/g, "&quot;")

    .replace(/'/g, "&#039;");

}
