const API_BASE_URL = "";


const registerForm =
    document.getElementById("registerForm");


registerForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();


        const email =
            document.getElementById("email").value;

        const password =
            document.getElementById("password").value;

        const password2 =
            document.getElementById("password2").value;

        const errorMessage =
            document.getElementById("errorMessage");


        errorMessage.textContent = "";


        if (password !== password2) {

            errorMessage.textContent =
                "Passwords do not match.";

            return;
        }


        try {

            const response = await fetch(
                `${API_BASE_URL}/api/auth/register/`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        email: email,
                        password: password,
                        password2: password2
                    })
                }
            );


            const data = await response.json();


            if (!response.ok) {

                console.log(data);

                const firstError =
                    data.email?.[0] ||
                    data.password?.[0] ||
                    data.error ||
                    "Registration failed. Check your details.";

                errorMessage.textContent = firstError;

                return;
            }


            window.location.href = "index.html";

        }

        catch (error) {

            console.error(error);

            errorMessage.textContent =
                "Unable to connect to the server.";
        }

    }
);