// /*

// inspiration: 
// https://dribbble.com/shots/2292415-Daily-UI-001-Day-001-Sign-Up

// */

// let form = document.querySelector('form');

// form.addEventListener('submit', (e) => {
//     const email = document.getElementById("email").value
//     const password = document.getElementById("password").value
//     if (!email) return alert("Missing email address!")
//     if (!password) return alert("Missing password!")
//     $.ajax({
//         type: "POST",
//         url: `/auth/login`,
//         data: {
//             email : email,
//             password : password
//         },
//     });
//     // e.preventDefault();
//     // return false;
// });