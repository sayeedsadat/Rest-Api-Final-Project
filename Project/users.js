const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();

const gds = require('./datastore');
const datastore = gds.datastore;

const USERS = "Users";

router.use(bodyParser.json());

/* ------------- Begin Owner Model Functions ------------- */
function getUsers() {
    const q = datastore.createQuery(USERS);
    return datastore.runQuery(q).then((entities) => {
        return entities[0].map(gds.fromDatastore);
    });
}
/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */
router.get('/', function (req, res) {
    const users = getUsers()
        .then((users) => {
            if (users[0] == undefined || users[0] == null) {
                return res.status(404).json({ 'Error': 'No users exist in the database.' });
            } else {
                for (let x in users) {
                    users[x].self = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + users[x].id;
                }
                res.status(200).json(users);
            }
        });
});


/* ------------- End Controller Functions ------------- */

module.exports = router;