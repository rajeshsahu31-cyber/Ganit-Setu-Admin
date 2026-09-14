(() => {
  const $ = (id) => document.getElementById(id);
  const text = $("postText");
  const preview = $("previewCard");
  const content = $("previewContent");
  const targetsOut = $("previewTargets");
  const timeOut = $("previewTime");
  const status = $("previewStatus");

  function selectedTargets() {
    return [...document.querySelectorAll('.checks input:checked')]
      .map(x => x.parentElement.textContent.trim());
  }

  function renderPreview(state = "Draft") {
    const value = text.value.trim();
    content.textContent = value || "यहाँ आपकी पोस्ट का preview दिखाई देगा।";
    targetsOut.textContent = selectedTargets().join("  •  ") || "कोई platform selected नहीं";
    timeOut.textContent = new Date().toLocaleString("hi-IN");
    status.textContent = state;
    preview.hidden = false;
  }

  $("previewBtn").addEventListener("click", () => renderPreview("Preview"));
  $("saveDraftBtn").addEventListener("click", () => {
    localStorage.setItem("gs_social_draft", JSON.stringify({
      text: text.value,
      targets: [...document.querySelectorAll('.checks input:checked')].map(x => x.value),
      savedAt: new Date().toISOString()
    }));
    renderPreview("Saved Draft");
    alert("Draft सुरक्षित कर दिया गया है।");
  });
  $("approveBtn").addEventListener("click", () => {
    if (!text.value.trim()) {
      alert("पहले Post text लिखिए।");
      text.focus();
      return;
    }
    renderPreview("Approved");
    alert("Post approved है। Actual Publish/Schedule API connection अगले चरण में जोड़ी जाएगी।");
  });

  try {
    const d = JSON.parse(localStorage.getItem("gs_social_draft") || "null");
    if (d) {
      text.value = d.text || "";
      document.querySelectorAll('.checks input').forEach(x => x.checked = d.targets?.includes(x.value) ?? true);
    }
  } catch (_) {}
})();
