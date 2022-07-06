import express, { request, response } from 'express'
import fetch from 'node-fetch'
import { connection } from './connection.js'
import cors from 'cors'


const app = express()
app.use(cors({ origin: "*" }));

const client_id = process.env.GITHUB_CLIENT_ID
const client_secret = process.env.GITHUB_CLIENT_SECRET


app.get('/user/signin/callback', async (request, response) => {

    if (typeof request.query.code === 'undefined') {
        response.redirect('http://localhost:8080')
    }
    const code = request.query.code
    const token = await getAccessToken(code)
    const githubData = await getGithubUser(token)
    const exists = await userFind(githubData.login)

    if (exists === null) {
        const user = await storeUserInDb(githubData)
        await storeUserReposInDb(token, user)
    }

    response.redirect("http://localhost:8080/profile/" + githubData.login)
})

app.get('/user/profile', async (request, response) => {

    const username = request.query.username

    const user = await userFind(username)

    response.json({ "user": user })
})

app.get('/login/github', (request, response) => {

    const url = `https://github.com/login/oauth/authorize?client_id=${client_id}&redirect_uri=http://localhost:9000/user/signin/callback`
    response.json({ "url": url })

});


async function getAccessToken(code) {
    const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            client_id,
            client_secret,
            code
        })
    })

    const data = await res.text();
    const params = new URLSearchParams(data);
    return params.get("access_token")

}

app.get('/user/repositories', async (request, response) => {

    const username = request.query.username
    const repos = await getReposFromDb(username)

    response.json({ "data": repos })

})

async function getGithubUser(access_token) {
    const req = await fetch('https://api.github.com/user', {
        headers: {
            Authorization: `bearer ${access_token}`
        }
    })

    const data = await req.json();
    return data;
}

async function storeUserInDb(userData) {

    const values = [userData.login, userData.html_url, userData.followers, userData.following, userData.updated_at];
    return new Promise((resolve, reject) => {
        connection.query(
            "INSERT INTO users (username, github_url, followers, following, updated_at) VALUES(?)",
            [values],
            (err, result) => {
                return err ? reject(err) : resolve(result.insertId);
            }
        );
    });
}

async function storeUserReposInDb(token, user) {

    const repos = await getUserRepositories(token)

    var values = [];
    repos.forEach(function (row) {
        values.push([row.full_name, row.html_url, user])
    })

    connection.query(
        "INSERT INTO repos (name, url, user_id) VALUES?",
        [values]
    );
}

async function getReposFromDb(username) {

    return new Promise((resolve, reject) => {

        connection.query("SELECT repos.name AS name,repos.url AS url FROM repos INNER JOIN users On users.id=repos.user_id WHERE users.username= " + connection.escape(username) + "", function (err, rows) {
            if (err) {
                console.log(err);
                return;
            } else {
                if (rows && rows.length) {
                    return resolve(rows);
                } else {
                    return resolve([]);
                }
            }

        })

    });
}

async function userFind(username) {

    return new Promise((resolve, reject) => {

        connection.query("SELECT * FROM users WHERE username= " + connection.escape(username) + "", function (err, row) {

            if (err) {
                console.log(err);
                return;
            } else {
                if (row && row.length) {
                    return resolve(row[0]);
                } else {
                    return resolve(null);
                }
            }

        })

    });
}

async function getUserRepositories(access_token) {
    const res = await fetch('https://api.github.com/user/repos', {
        headers: {
            Authorization: `bearer ${access_token}`
        }
    })
    const data = await res.json();
    return data;
}

const PORT = 9000
app.listen(PORT)