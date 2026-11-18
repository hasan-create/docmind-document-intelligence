const API_BASE_URL = "";


const loginForm = document.getElementById("loginForm");


loginForm.addEventListener("submit", async function (event) {

    event.preventDefault();


    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const errorMessage = document.getElementById("errorMessage");


    errorMessage.textContent = "";


    try {

        const response = await fetch(
            `${API_BASE_URL}/api/auth/login/`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    email: email,
                    password: password
                })
            }
        );


        const data = await response.json();


        if (!response.ok) {

            errorMessage.textContent =
                data.detail ||
                "Invalid email or password.";

            return;
        }


        localStorage.setItem(
            "access_token",
            data.access
        );


        localStorage.setItem(
            "refresh_token",
            data.refresh
        );


        window.location.href = "dashboard.html";

    }

    catch (error) {

        console.error(error);

        errorMessage.textContent =
            "Unable to connect to the server.";
    }

});