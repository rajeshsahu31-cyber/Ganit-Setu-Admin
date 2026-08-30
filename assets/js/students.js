// ============================================
// GANIT SETU ADMIN - STUDENT MANAGEMENT
// LIVE SUPABASE DATA
// ============================================

const SUPABASE_URL = "https://cbgojvnbkosdehvwerth.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";


const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);


// ============================================
// Global Data
// ============================================

let allStudents = [];

let currentClassFilter = "all";


// ============================================
// DOM Ready
// ============================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    document
      .getElementById("search")
      .addEventListener(
        "input",
        filterStudents
      );


    document
      .getElementById("allBtn")
      .addEventListener(
        "click",
        () => {

          currentClassFilter = "all";

          filterStudents();

        }
      );


    document
      .getElementById("class9Btn")
      .addEventListener(
        "click",
        () => {

          currentClassFilter = 9;

          filterStudents();

        }
      );


    document
      .getElementById("class10Btn")
      .addEventListener(
        "click",
        () => {

          currentClassFilter = 10;

          filterStudents();

        }
      );


    loadStudents();

  }
);


// ============================================
// Load Students From Supabase
// ============================================

async function loadStudents() {

  const studentList =
    document.getElementById("studentList");


  studentList.innerHTML = `

    <div class="loading-box">

      ⏳ विद्यार्थियों की जानकारी लोड हो रही है...

    </div>

  `;


  try {

    const {
      data,
      error
    } = await supabaseClient

      .from("students")

      .select(`
        id,
        student_id,
        full_name,
        class_level,
        school_name,
        school_dise_code,
        district,
        mobile,
        photo_url,
        status,
        created_at
      `)

      .order(
        "student_number",
        {
          ascending: true
        }
      );


    if (error) throw error;


    allStudents =
      data || [];


    renderStudents(
      allStudents
    );


  } catch (error) {

    console.error(
      "Admin Students Load Error:",
      error
    );


    studentList.innerHTML = `

      <div class="error-box">

        ❌ विद्यार्थियों की जानकारी लोड नहीं हो सकी।

        <br><br>

        ${escapeHtml(error.message || "Unknown Error")}

      </div>

    `;

  }

}


// ============================================
// Search + Class Filter
// ============================================

function filterStudents() {

  const query =
    String(
      document.getElementById("search").value || ""
    )
      .trim()
      .toLowerCase();


  const filtered =
    allStudents.filter(student => {


      // Class Filter

      if (
        currentClassFilter !== "all" &&
        Number(student.class_level) !==
        Number(currentClassFilter)
      ) {

        return false;

      }


      // Search

      const searchableText = [

        student.student_id,
        student.full_name,
        student.school_name,
        student.school_dise_code,
        student.district

      ]

        .join(" ")

        .toLowerCase();


      return searchableText.includes(query);

    });


  renderStudents(filtered);

}


// ============================================
// Render Students
// ============================================

function renderStudents(students) {

  const studentList =
    document.getElementById("studentList");


  if (!students.length) {

    studentList.innerHTML = `

      <div class="empty-box">

        👨‍🎓 कोई विद्यार्थी नहीं मिला।

      </div>

    `;

    return;

  }


  studentList.innerHTML =
    students.map(student => {


      const initials =
        getInitials(student.full_name);


      const photoHtml =
        student.photo_url

          ? `
            <img
              src="${escapeHtml(student.photo_url)}"
              alt="Student Photo"
              onerror="this.parentElement.innerHTML='${escapeHtml(initials)}'"
            >
          `

          : initials;


      const status =
        String(student.status || "active")
          .toLowerCase();


      const statusClass =
        status === "active"

          ? "status-active"

          : "status-inactive";


      const statusText =
        status === "active"

          ? "सक्रिय"

          : "निष्क्रिय";


      return `

        <div class="student-row">


          <span>

            <b>
              ${escapeHtml(student.student_id || "—")}
            </b>

          </span>



          <span>

            <div class="student-profile">

              <div class="student-photo">

                ${photoHtml}

              </div>


              <div>

                <b>
                  ${escapeHtml(student.full_name || "—")}
                </b>


                <br>


                <small>

                  📍 ${escapeHtml(student.district || "—")}

                </small>

              </div>

            </div>

          </span>



          <span>

            कक्षा ${escapeHtml(student.class_level || "—")}

          </span>



          <span>

            ${escapeHtml(student.school_name || "—")}

          </span>



          <span>

            ${escapeHtml(student.school_dise_code || "—")}

          </span>



          <span
            class="${statusClass}"
          >

            ${statusText}

          </span>


        </div>

      `;

    })

    .join("");

}


// ============================================
// Initials
// ============================================

function getInitials(name) {

  return String(name || "GS")

    .trim()

    .split(/\s+/)

    .map(
      word => word.charAt(0)
    )

    .join("")

    .slice(0, 2)

    .toUpperCase();

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
