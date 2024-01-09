
const express = require('express');
const { engine } = require('express-handlebars');
const app = express();
const bodyParser = require('body-parser');
const router = express.Router();
const axios = require('axios');
const { OAuth2Client, TokenPayload } = require('google-auth-library')

const gds = require('./datastore');
const datastore = gds.datastore;

const USERS = "Users";
const STATES = "States";

app.engine('handlebars', engine());
app.use(bodyParser.json());

//Serves static files
app.use(express.static('public'))

//https://hackersandslackers.com/handlebars-templates-expressjs/
const handlebars = require('express-handlebars');
//Sets our app to use the handlebars engine
app.set('view engine', 'hbs');

app.engine('hbs', handlebars.engine({
    layoutsDir: __dirname + '/views/layouts',
    extname: 'hbs',
    defaultLayout: 'index'
}));


//Global Variables
const CLIENTID = '755261645076-fj1tc368tp4o5snqpoorkiivp9cp9c8m.apps.googleusercontent.com';
const CLIENTSECRET = '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';
const CLIENTURL = 'https://finaproject-sadats-460pm.uw.r.appspot.com/oauth';
let randomState = null;


/**
 * @description Function to decode Google OAuth token
 * @param token: string
 * @returns ticket object
 */
async function getDecodedOAuthJwtGoogle(token) {

    const CLIENT_ID_GOOGLE = CLIENTID

    try {
        const client = new OAuth2Client(CLIENT_ID_GOOGLE)

        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: CLIENT_ID_GOOGLE,
        })

        return ticket.getPayload();
    } catch (error) {
        return { status: 500, data: error }
    }
}

function createUser(name, lastname, subId) {
    let key = datastore.key(USERS);
    const newUser = { "name": name, "lastname": lastname, "subid": subId };
    return datastore.save({ "key": key, "data": newUser }).then(() => { return key });
}

function getUser() {
    const q = datastore.createQuery(USERS);
    return datastore.runQuery(q).then((entities) => {
        return entities[0].map(gds.fromDatastore);
    });
}

function createState(state) {
    let key = datastore.key(STATES);
    const new_state = { "name": state };
    return datastore.save({ "key": key, "data": new_state }).then(() => { return key });
}

function getStates() {
    const q = datastore.createQuery(STATES);
    return datastore.runQuery(q).then((entities) => {
        return entities[0].map(gds.fromDatastore);
    });
}

//https://stackoverflow.com/questions/9719570/generate-random-password-string-with-requirements-in-javascript
function randPassword(letters, numbers, either) {
    let chars = [
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", // letters
        "0123456789", // numbers
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" // either
    ];

    return [letters, numbers, either].map(function (len, i) {
        return Array(len).fill(chars[i]).map(function (x) {
            return x[Math.floor(Math.random() * x.length)];
        }).join('');
    }).concat().join('').split('').sort(function () {
        return 0.5 - Math.random();
    }).join('')
}

app.get('/', (req, res) => {
    //Serves the body of the page aka "main.handlebars" to the container //aka "index.handlebars"
    res.render('main', { layout: 'index' });
});

//Redirects to google OAuth Server
app.get('/redirect', (req, res) => {
    randomState = randPassword(5, 3, 2);
    console.log(randomState);
    createState(randomState);
    redirect_google_OAuth_server = 'https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=' + CLIENTID + '&redirect_uri=' + CLIENTURL + '&scope=profile&state=' + randomState;
    res.redirect(redirect_google_OAuth_server);
});

app.get('/oauth', (req, res) => {
    getStates()
        .then(allStates => {
            stateExists = allStates.filter(item => { return item.name === req.query.state })
            //Compare state on redirect
            if (stateExists) {
                const data = {
                    code: req.query.code,
                    client_id: CLIENTID,
                    client_secret: CLIENTSECRET,
                    redirect_uri: CLIENTURL,
                    grant_type: 'authorization_code'
                }
                //Request access code
                axios({
                    method: 'post',
                    url: 'https://oauth2.googleapis.com/token',
                    data: data,
                    headers: {
                        'Accept-Encoding': 'application/json',
                    }
                })
                    .then(response => {
                        accessToken = response.data.access_token;
                        tokenType = response.data.token_type;
                        tokenId = response.data.id_token;

                        console.log("access token: " + accessToken);
                        console.log("token type: " + tokenType);
                        console.log("id token: " + tokenId);
                        //Request user information using the access token
                        axios({
                            method: 'get',
                            url: 'https://people.googleapis.com/v1/people/me?personFields=names',
                            headers: {
                                'Authorization': `${tokenType} ${accessToken}`,
                                'Accept-Encoding': 'application/json'
                            }
                        })
                            .then(response => {
                                //https://handlebarsjs.com/guide/#what-is-handlebars
                                let content = {};
                                console.log(response.data);
                                content.firstName = response.data.names[0].givenName;
                                content.lastName = response.data.names[0].familyName;
                                content.jwtToken = tokenId;
                                getDecodedOAuthJwtGoogle(tokenId)
                                    .then(decryptedJWT => {
                                        return content.subId = decryptedJWT.sub;
                                    })
                                    .then(() => {
                                        return getUser()
                                    })
                                    .then(users => {
                                        console.log(users);
                                        usersExists = users.filter(user => { return user.subid === content.subId });
                                        return usersExists;
                                    })
                                    .then(userExists => {
                                        if (userExists === undefined || (Array.isArray(userExists) && !userExists.length)) {
                                            //Add User to the database
                                            createUser(content.firstName, content.lastName, content.subId)
                                                .then(() => {
                                                    return res.render('data', content);
                                                })
                                        } else {
                                            return res.render('data', content);
                                        }
                                    })
                                    .catch(error => {
                                        // handle error
                                        console.log(error);
                                    });

                            })
                            .catch(error => {
                                // handle error
                                console.log(error);
                            });
                    });
            }
        });
});

module.exports = router;
module.exports = app;