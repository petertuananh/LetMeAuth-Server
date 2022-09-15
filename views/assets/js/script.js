function signup() {
    const name = document.getElementById("name").value
    const email = document.getElementById("email").value
    const password = document.getElementById("password").value
    const username = document.getElementById("username").value
    if (!name) return alert("Missing application name!")
    if (!email) return alert("Missing email address!")
    if (!username) return alert("Missing username!")
    if (!password) return alert("Missing password!")
    $.ajax({
        type: "POST",
        url: `/signup`,
        data: {
            name : name,
            email : email,
            username : username,
            password : password
        },
    });
}