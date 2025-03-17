const users = require("../controllers/user");

const user = (app) =>{
        app.post("/v1/user/signup", users.signup);
        app.post("/v1/user/verifyOtp", users.verifyOtp);
        app.post("/v1/user/resendOTP", users.resendOTP);
        app.post("/v1/user/forgotPassword", users.forgotPassword);
        app.post("/v1/user/resetPassword", users.resetPassword);
        app.post("/v1/user/login", users.login);
        app.post("/v1/user/complete-profile", users.complete_profile);
        app.post("/v1/user/get-item-details", users.get_item_details);
        app.post("/v1/user/add-delivery-address", users.add_delivery_address);
        app.post("/v1/user/help-support", users.help_support);
        app.post("/v1/user/list-notification", users.list_notifications);
        app.post("/v1/user/make-order", users.make_order);
        app.post("/v1/user/logout", users.logout);
        app.post("/v1/user/delete-account", users.delete_account);
        app.post("/v1/user/show-order-detail", users.show_order_details);
        app.post("/v1/user/home-page", users.display_home_page);
}

module.exports = user;