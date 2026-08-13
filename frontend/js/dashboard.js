window.addEventListener("beforeunload", () => {
    console.trace("🔥 PAGE IS UNLOADING");
});

console.log("DASHBOARD JS LOADED", Date.now());
const API_BASE_URL = "http://127.0.0.1:8000";


// =========================
// AUTH
// =========================

const accessToken = localStorage.getItem("access_token");

if (!accessToken) {
    window.location.href = "index.html";
}


// =========================
// ELEMENTS
// =========================

const uploadForm =
    document.getElementById("uploadForm");

const uploadMessage =
    document.getElementById("uploadMessage");

const logoutBtn =
    document.getElementById("logoutBtn");

const uploadButton =
    document.getElementById("uploadBtn");

const uploadButtonText =
    document.getElementById("uploadBtnText");


// =========================
// LOGOUT
// =========================

logoutBtn.addEventListener("click", function () {

    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");

    window.location.href = "index.html";

});


// =========================
// UPLOAD PDF
// =========================

uploadForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();


        const title =
            document.getElementById("title").value.trim();

        const pdfFile =
            document.getElementById("pdfFile").files[0];


        // =========================
        // VALIDATION
        // =========================

        if (!title) {

            uploadMessage.textContent =
                "Please enter a document title.";

            return;
        }


        if (!pdfFile) {

            uploadMessage.textContent =
                "Please select a PDF.";

            return;
        }


        if (
            pdfFile.type !== "application/pdf" &&
            !pdfFile.name.toLowerCase().endsWith(".pdf")
        ) {

            uploadMessage.textContent =
                "Please select a valid PDF file.";

            return;
        }


        // =========================
        // FORM DATA
        // =========================

        const formData =
            new FormData();

        formData.append(
            "title",
            title
        );

        formData.append(
            "file",
            pdfFile
        );


        // =========================
        // UI - PROCESSING
        // =========================

        uploadMessage.textContent =
            "⏳ Uploading and processing PDF...";


        uploadButton.disabled = true;

        uploadButtonText.textContent =
            "Processing...";


        console.log(
            "Sending PDF to Django..."
        );


        try {

            // =========================
            // SEND TO DJANGO
            // =========================

            const response =
                await fetch(
                    `${API_BASE_URL}/api/documents/upload/`,
                    {
                        method: "POST",

                        headers: {
                            "Authorization":
                                `Bearer ${accessToken}`
                        },

                        body: formData
                    }
                );


            console.log(
                "Django status:",
                response.status
            );


            // =========================
            // READ RESPONSE
            // =========================

            const data =
                await response.json();


            console.log(
                "Django response:",
                data
            );


            // =========================
            // ERROR
            // =========================

            if (!response.ok) {

                uploadMessage.textContent =
                    "❌ Upload failed.";

                console.error(
                    "Upload error:",
                    data
                );

                return;
            }


            // =========================
            // SUCCESS
            // =========================

            console.log(
                "UPLOAD SUCCESS"
            );


            console.log(
                "DOCUMENT ID:",
                data.id
            );


            if (!data.id) {

                uploadMessage.textContent =
                    "Upload completed, but no document ID was returned.";

                console.error(
                    "Document ID missing:",
                    data
                );

                return;
            }


            uploadMessage.textContent =
                "✅ Document ready! Opening chat...";


            // =========================
            // OPEN CHAT
            // =========================

            window.location.href =
                `chat.html?document_id=${data.id}`;

        }


        catch (error) {

            console.error(
                "Upload error:",
                error
            );


            uploadMessage.textContent =
                "❌ Unable to connect to Django.";

        }


        finally {

            uploadButton.disabled =
                false;

            uploadButtonText.textContent =
                "Upload & Start Chat";

        }

    }
);