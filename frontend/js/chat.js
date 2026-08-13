const API_BASE_URL = "http://127.0.0.1:8000";


// =========================
// AUTH
// =========================

const accessToken = localStorage.getItem("access_token");

if (!accessToken) {

    window.location.href = "index.html";

}


// =========================
// GET DOCUMENT ID
// =========================

const urlParams =
    new URLSearchParams(window.location.search);


const documentId =
    urlParams.get("document_id");


if (!documentId) {

    alert("No document selected.");

    window.location.href =
        "dashboard.html";

}


// =========================
// ELEMENTS
// =========================

const chatForm =
    document.getElementById("chatForm");

const questionInput =
    document.getElementById("question");

const chatMessages =
    document.getElementById("chatMessages");

const chatError =
    document.getElementById("chatError");

const backBtn =
    document.getElementById("backBtn");


// =========================
// BACK TO DASHBOARD
// =========================

backBtn.addEventListener(
    "click",
    function () {

        window.location.href =
            "dashboard.html";

    }
);


// =========================
// SEND QUESTION
// =========================

chatForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();


        const question =
            questionInput.value.trim();


        if (!question) {
            return;
        }


        // Clear previous error
        chatError.textContent = "";


        // =========================
        // USER MESSAGE
        // =========================

        addMessage(
            question,
            "user"
        );


        questionInput.value = "";


        // =========================
        // LOADING MESSAGE
        // =========================

        const loadingMessage =
            addMessage(
                "Thinking...",
                "ai"
            );


        // Disable input while waiting
        questionInput.disabled = true;


        try {

            console.log(
                "Sending question..."
            );


            const response =
                await fetch(
                    `${API_BASE_URL}/api/documents/chat/`,
                    {
                        method: "POST",

                        headers: {

                            "Content-Type":
                                "application/json",

                            "Authorization":
                                `Bearer ${accessToken}`

                        },

                        body: JSON.stringify({

                            document_id:
                                Number(documentId),

                            question:
                                question

                        })
                    }
                );


            console.log(
                "Chat response status:",
                response.status
            );


            const data =
                await response.json();


            console.log(
                "Chat response:",
                data
            );


            // Remove "Thinking..."
            loadingMessage.remove();


            // =========================
            // ERROR
            // =========================

            if (!response.ok) {

                addMessage(
                    "Something went wrong while generating the answer.",
                    "ai"
                );

                console.error(
                    "Chat error:",
                    data
                );

                return;
            }


            // =========================
            // AI ANSWER
            // =========================

            addMessage(
                data.answer,
                "ai"
            );

        }


        catch (error) {

            console.error(
                "Chat error:",
                error
            );


            loadingMessage.remove();


            chatError.textContent =
                "Unable to connect to the server.";

        }


        finally {

            questionInput.disabled = false;

            questionInput.focus();

        }

    }
);


// =========================
// ADD MESSAGE
// =========================

function addMessage(text, sender) {

    const message =
        document.createElement("div");


    message.classList.add(
        "chat-message",
        sender
    );


    message.textContent =
        text;


    chatMessages.appendChild(
        message
    );


    // Scroll to bottom
    chatMessages.scrollTop =
        chatMessages.scrollHeight;


    return message;

}