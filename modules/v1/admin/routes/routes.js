const Admin = require("../controllers/admin");

const admin = (app) =>{
    app.post("/v1/admin/admin-login", Admin.admin_login);
    app.post("/v1/admin/add-items", Admin.add_items);
}

module.exports = admin;