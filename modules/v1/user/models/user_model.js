const common = require("../../../../utilities/common");
const database = require("../../../../config/database");
const response_code = require("../../../../utilities/response-error-code");
const md5 = require("md5");
const {default: localizify} = require('localizify');
const en = require("../../../../language/en");
const fr = require("../../../../language/fr");
const guj = require("../../../../language/guj");
const validator = require("../../../../middlewares/validator");
var lib = require('crypto-lib');

const { t } = require('localizify');
// const user = require("../controllers/user");

class userModel{
    async signup(request_data, callback) {
        try {
            // decrypt data and convert into json
            // const request_data = JSON.parse(common.decryptPlain(requested_data));

            const data = {
                user_name: request_data.user_name,
                code_id: request_data.code_id,
                email_id: request_data.email_id,
                password_: md5(request_data.password_),
                phone_number: request_data.phone_number,
                is_deleted: 0,
                is_active: 1
            };
    
            const device_data = {};
    
            if (request_data.device_type) device_data.device_type = request_data.device_type;
            if (request_data.os_version) device_data.os_version = request_data.os_version;
            if (request_data.app_version) device_data.app_version = request_data.app_version;
    
            const selectUser = `SELECT * FROM tbl_user WHERE email_id = ? OR phone_number = ?`;
            const [result] = await database.query(selectUser, [request_data.email_id, request_data.phone_number || '']);
    
            // USER FOUND
            if (result.length > 0) {
                const user_data_ = result[0];
                const user_id = user_data_.user_id;
    
                // If user is deleted and inactive, reactivate & update details
                if (user_data_.is_deleted == 1 && user_data_.is_active == 0) {
                    const updateUserQuery = `UPDATE tbl_user SET ? WHERE user_id = ?`;
                    await database.query(updateUserQuery, [data, user_id]);
                    console.log("User reactivated and updated");
    
                    // Now, update OTP
                    await common.updateOtp(user_id); 
                    console.log("OTP updated for reactivated user");
    
                    return callback(common.encrypt({
                        code: response_code.SUCCESS,
                        message: "Account reactivated. OTP sent for verification."
                    }));
    
                } else {
                    // If user already verified
                    const findIsVerify = `SELECT * from tbl_otp where user_id = ? and verify = 1`;
                    const [data_verify] = await database.query(findIsVerify, [user_id]);
    
                    if (data_verify.length > 0) {
                        return callback(common.encrypt({
                            code: response_code.OPERATION_FAILED,
                            message: "User already registered and verified, please login",
                            data: user_data_
                        }));
                    } else {
                        console.log("here");
                        const otp_obj = request_data.otp ? { otp: request_data.otp } : {};
                        otp_obj.is_deleted = 0;
                        otp_obj.is_active = 1;
                        console.log(otp_obj);

                        common.updateUserInfo(user_id, otp_obj, (error, updateUser) => {
                            if (error) {
                                const message = {
                                    code: response_code.OPERATION_FAILED,
                                    message: t('email_already_present')
                                }
                                const sendMessage = common.encrypt(message);
                                return callback(sendMessage);
                            }
                            const message = {
                                code: response_code.SUCCESS,
                                message: "Successfully Verified",
                                data: updateUser
                            }

                            const sendMessage = common.encrypt(message);
                            return callback(sendMessage);
                        });
                    }
                }
            } else {
                // NEW USER - Insert
                const insertUser = `INSERT INTO tbl_user SET ?`;
                const [insertResult] = await database.query(insertUser, data);
                const userId = insertResult.insertId;
                console.log("New User ID:", userId);
    
                await this.enterOtp(userId);
    
                // Insert device data if available
                if (Object.keys(device_data).length > 0) {
                    device_data.user_id = userId;
                    device_data.device_token = common.generateToken(40);
                    const insertDeviceData = "INSERT INTO tbl_device_info SET ?";
                    await database.query(insertDeviceData, device_data);
                }
    
                // Fetch and handle user details
                common.getUserDetail(userId, userId, async (err, userInfo) => {
                    if (err) {
                        const message = {
                            code: response_code.OPERATION_FAILED,
                            message: t('rest_keywords_something_went_wrong')
                        }
                        const sendMessage = common.encrypt(message);
                        return callback(sendMessage);
                    }
    
                    // Handle profile completion and tokens
                    if (userInfo.is_profile_completed === 1) {
                        const userToken = common.generateToken(40);
                        const deviceToken = common.generateToken(40);
                        await Promise.all([
                            database.query(`UPDATE tbl_user SET token = ? WHERE user_id = ?`, [userToken, userId]),
                            database.query("UPDATE tbl_device_info SET device_token = ? WHERE user_id = ?", [deviceToken, userId])
                        ]);
                        userInfo.token = userToken;
                        userInfo.device_token = deviceToken;

                        const message = {
                            code: response_code.VERIFICATION_PENDING,
                            message: t('rest_keywords_success') + "... " + t('verification_pending'),
                            data: userInfo
                        };
                        const sendMessage = common.encrypt(message);
                        return callback(sendMessage);

                    } else {
                        await database.query(`UPDATE tbl_user SET isstep_ = ? WHERE user_id = ?`, ['1', userId]);
                        const message = {
                            code: response_code.VERIFICATION_PENDING,
                            message: t('rest_keywords_success') + "... " + t('verification_profile_pending'),
                            data: userInfo
                        }
                        const sendMessage = common.encrypt(message);
                        return callback(sendMessage);
                    }
                });
            }
        } catch (error) {
            console.log("Signup Error: ", error);
            const message = {
                code: response_code.OPERATION_FAILED,
                message: t('rest_keywords_something_went_wrong')
            }
            const sendMessage = common.encrypt(message);
            return callback(sendMessage);
        }
    } 

    async enterOtp(user_id){
        const otp = common.generateOtp(4);
        const insertOtpQuery = "INSERT INTO tbl_otp (user_id, otp) VALUES (?, ?)";
        await database.query(insertOtpQuery, [user_id, otp]);
        console.log("OTP sent to user_id:", user_id, "OTP:", otp);
    }

    async verifyOtp(request_data, callback) {
        try {
            // decrypt data and parse into json
            // const request_data = JSON.parse(common.decryptPlain(requested_data));

            const {email_id} = request_data;
            const selectUserQuery = "SELECT user_id FROM tbl_user WHERE email_id = ? and is_active = 1 and is_deleted = 0";
            const [userResult] = await database.query(selectUserQuery, [email_id]);

            if (userResult.length === 0) {
                return callback(common.encrypt({
                    code: response_code.NOT_FOUND,
                    message: t('email_not_registered')
                }));
            }

            const user_id = userResult[0].user_id;
    
            const selectUserWithUnverified = "SELECT * FROM tbl_otp WHERE user_id = ? and is_active = 1 and is_deleted = 0";
            const [result] = await database.query(selectUserWithUnverified, [user_id]);
    
            if (result.length === 0) {
                return callback(common.encrypt({
                    code: response_code.OPERATION_FAILED,
                    message: t('otp_not_found')
                }));
            }
    
            const userOtpData = result[0];
            const currentTime = new Date();
            const expireTime = new Date(userOtpData.expire_time);
    
            if (userOtpData.verify === 1) {
                return callback(common.encrypt({
                    code: response_code.SUCCESS,
                    message: t('already_verified'),
                    data: userOtpData
                }));
            }

            if (currentTime > expireTime) {
                const newOtp = common.generateOtp(4)
                const newExpireTime = new Date();
                newExpireTime.setHours(newExpireTime.getHours() + 1);
    
                const updateOtpQuery = "UPDATE tbl_otp SET otp = ?, expire_time = ? WHERE user_id = ?";
                await database.query(updateOtpQuery, [newOtp, newExpireTime, user_id]);
    
                return callback(common.encrypt({
                    code: response_code.SUCCESS,
                    message: "OTP Expired. New OTP sent.",
                    data: { newOtp, expire_time: newExpireTime }
                }));
            }
    
            if (request_data.otp === userOtpData.otp) {
                const updateUserQuery = "UPDATE tbl_otp SET verify = 1 WHERE user_id = ?";
                await database.query(updateUserQuery, [user_id]);

                const updateIsStepQuery = "UPDATE tbl_user SET isstep_ = ? WHERE user_id = ?";
                await database.query(updateIsStepQuery, ['2', user_id]);
    
                return callback(common.encrypt({
                    code: response_code.SUCCESS,
                    message: t('otp_verify_success')
                }));
            } else {
                return callback(common.encrypt({
                    code: response_code.OPERATION_FAILED,
                    message: t('invalid_otp')
                }));
            }
        } catch (error) {
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: t('some_error_occurred'),
                data: error.message
            }));
        }
    }

    async resendOTP(request_data, callback){
        try{
        // decrypt and parse into JSON    
        // const request_data = JSON.parse(common.decryptPlain(requested_data));

        const {email_id} = request_data;
        const selectUserQuery = "SELECT user_id FROM tbl_user WHERE email_id = ? and is_active = 1 and is_deleted = 0";
        const [userResult] = await database.query(selectUserQuery, [email_id]);

        if (userResult.length === 0) {
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: t('email_not_registered')
            }));
        }

        const user_id = userResult[0].user_id;
        const newOtp = common.generateOtp(4);
        const newExpireTime = new Date();
        newExpireTime.setHours(newExpireTime.getHours() + 1);
        const selectOtpQuery = "SELECT otp, expire_time, verify FROM tbl_otp WHERE user_id = ? and is_active = 1 and is_deleted = 0";
        const [otpResult] = await database.query(selectOtpQuery, [user_id]);

        if (otpResult.length === 0) {
            const insertOtpQuery = "INSERT INTO tbl_otp (user_id, otp, expire_time, verify) VALUES (?, ?, ?, 0)";
            await database.query(insertOtpQuery, [user_id, newOtp, newExpireTime]);

            console.log(`New OTP for User ID ${user_id}: ${newOtp}`);

            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: t('new_otp_generated_sent_msg'),
                data: { user_id, expire_time: newExpireTime }
            }));
        }

        const { otp, expire_time, verify } = otpResult[0];
        const currentTime = new Date();
        if (verify === 1) {
            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: t('otp_already_verified'),
            }));
        }

        if (expire_time < currentTime || verify === 0) {
            const updateOtpQuery = `
                UPDATE tbl_otp SET otp = ?, expire_time = ?, verify = 0 WHERE user_id = ?
            `;
            await database.query(updateOtpQuery, [newOtp, newExpireTime, user_id]);

            console.log(`Updated OTP for User ID ${user_id}: ${newOtp}`);

            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: t('new_otp_sent'),
                data: { user_id, expire_time: newExpireTime }
            }));
        }
        }catch (error) {
        return callback(common.encrypt({
            code: response_code.OPERATION_FAILED,
            message: t('some_error_occurred'),
            data: error
        }));
    }
    }

    async forgotPassword(request_data, callback) {
        try {
            // const request_data = JSON.parse(common.decryptPlain(requested_data));

            if (!request_data.email_id && !request_data.phone_number) {
                return callback(common.encrypt({
                    code: response_code.OPERATION_FAILED,
                    message: t('provide_email_or_mobile')
                }));
            }
    
            const data = {};
            let userQuery = "SELECT * FROM tbl_user WHERE ";
            const queryConditions = [];
            const queryParams = [];
    
            if (request_data.email_id) {
                queryConditions.push("email_id = ?");
                queryParams.push(request_data.email_id);
            }
    
            if (request_data.phone_number) {
                queryConditions.push("phone_number = ?");
                queryParams.push(request_data.mobile_number);
            }
    
            userQuery += queryConditions.join(" OR ");
    
            const [userResult] = await database.query(userQuery, queryParams);
    
            if (userResult.length === 0) {
                return callback(common.encrypt({
                    code: response_code.OPERATION_FAILED,
                    message: t('user_not_found_signup_req')
                }));
            }
    
            const user = userResult[0];
            const resetToken = common.generateToken(10);
            
            const tokenData = {
                reset_token: resetToken,
                expires_at: new Date(Date.now() + 3600000)
            };
    
            if (request_data.email_id) {
                tokenData.email_id = request_data.email_id;
                tokenData.phone_number = null;
            } else if (request_data.phone_number) {
                tokenData.phone_number = request_data.phone_number;
                tokenData.email_id = null;
            }
    
            await database.query("INSERT INTO tbl_forgot_passwords SET ?", tokenData);
            
            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: t('password_reset_token_sent')
            }));
    
        } catch(error) {
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: error.sqlMessage || t('forgot_password_error')
            }));
        }
    }

    async resetPassword(requested_data, callback){
        // const requested_data = JSON.parse(common.decryptPlain(request_data));

        const { reset_token, new_password } = requested_data;
        console.log(reset_token);
    
        try {
            const selectTokenQuery = `
                SELECT email_id, phone_number FROM tbl_forgot_passwords 
                WHERE reset_token = '${reset_token}' AND is_active = 1 AND expires_at > NOW()
            `;
            console.log(selectTokenQuery);
    
            const [result] = await database.query(selectTokenQuery);
            console.log(result);
    
            if (!result.length) {
                return callback(common.encrypt({
                    code: response_code.NOT_FOUND,
                    message: t('invalid_expired_reset_token')
                }));
            }
    
            const email_id = result[0].email_id;
            const mobile_number = result[0].mobile_number;
            const hashedPassword = md5(new_password);
    
            const updatePasswordQuery = "UPDATE tbl_user SET password_ = ? WHERE email_id = ? or phone_number = ?";
            await database.query(updatePasswordQuery, [hashedPassword, email_id, mobile_number]);
    
            const deactivateTokenQuery = "UPDATE tbl_forgot_passwords SET is_active = 0 WHERE reset_token = ?";
            await database.query(deactivateTokenQuery, [reset_token]);
    
            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: t('password_reset_success')
            }));
    
        } catch (error) {
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: error.sqlMessage || t('password_reset_error')
            }));
        }
    }

    async login(request_data, callback){
        // const requested_data = JSON.parse(common.decryptPlain(requested_data));

        const user_data = {};
        if(request_data.email_id != undefined && request_data.email_id != ""){
            user_data.email_id = request_data.email_id;
        }
        if(request_data.phone_number != undefined && request_data.phone_number != ""){
            user_data.phone_number = request_data.phone_number;
        }
        if(request_data.password_ != undefined){
            user_data.password_ = md5(request_data.password_);
        }

        var selectUserWithCred = "SELECT * FROM tbl_user WHERE (email_id = ? AND password_ = ?) or (phone_number = ? and password_ = ?) and is_active = 1 and is_deleted = 0";
        var params = [user_data.email_id, user_data.password_, user_data.phone_number, user_data.password_];

        try{
            const [status] = await database.query(selectUserWithCred, params);

            if (status.length === 0) {
                return callback(common.encrypt({
                    code: response_code.NOT_FOUND,
                    message: t('no_data_found')
                }));
            }

            const user_id = status[0].user_id;

            const token = common.generateToken(40);
            const updateTokenQuery = "UPDATE tbl_user SET token = ?, is_login = 1 WHERE user_id = ?";
            await database.query(updateTokenQuery, [token, user_id]);

            const device_token = common.generateToken(40);
            const updateDeviceToken = "UPDATE tbl_device_info SET device_token = ? WHERE user_id = ?";
            await database.query(updateDeviceToken, [device_token, user_id]);

            common.getUserDetailLogin(user_id, (err, userInfo)=>{
                if(err){
                    console.log("Error here", err);
                    return callback(common.encrypt({
                        code: response_code.OPERATION_FAILED,
                        message: t('no_data_found')
                    }));
                }
                else{
                    userInfo.token = token;
                    userInfo.device_token = device_token;
                    return callback(common.encrypt({
                        code: response_code.SUCCESS,
                        message: t('login_success'),
                        data: userInfo
                    }));

                }
            });

        } catch(error){
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: error.sqlMessage || t('login_error')
            }));
        }
    }
    
    async complete_profile(request_data, user_id, callback) {
        try {
            console.log(user_id);
            // const request_data = JSON.parse(common.decryptPlain(requested_data));
    
            const [checkResult] = await database.query(
                `SELECT isstep_ FROM tbl_user WHERE user_id = ?`,
                [user_id]
            );
    
            if (checkResult.length === 0) {
                return callback(common.encrypt({
                    code: response_code.OPERATION_FAILED,
                    message: "User not found"
                }));
            }
    
            const currentStep = checkResult[0].isstep_;
    
            if (currentStep !== '3') {
                const goal_loc_data = {
                    latitude: request_data.latitude,
                    longitude: request_data.longitude,
                    goal_id: request_data.goal_id
                };
    
                const updateGoalLocQuery = `
                    UPDATE tbl_user
                    SET latitude = ?, longitude = ?, goal_id = ?, isstep_ = '3'
                    WHERE user_id = ?
                `;
                await database.query(updateGoalLocQuery, [
                    goal_loc_data.latitude,
                    goal_loc_data.longitude,
                    goal_loc_data.goal_id,
                    user_id
                ]);
            }
    
            const profile_fields = [];
            const profile_values = [];
    
            if (request_data.gender) {
                profile_fields.push('gender = ?');
                profile_values.push(request_data.gender);
            }
            if (request_data.dob) {
                profile_fields.push('dob = ?');
                profile_values.push(request_data.dob);
            }
            if (request_data.target_weight_kg) {
                profile_fields.push('target_weight_kg = ?');
                profile_values.push(request_data.target_weight_kg);
            }
            if (request_data.current_weight_kg) {
                profile_fields.push('current_weight_kg = ?');
                profile_values.push(request_data.current_weight_kg);
            }
            if (request_data.activity_level) {
                profile_fields.push('activity_level = ?');
                profile_values.push(request_data.activity_level);
            }
    
            if (profile_fields.length > 0) {
                profile_fields.push("isstep_ = '4', is_profile_completed = 1");
                const updateProfileQuery = `
                    UPDATE tbl_user
                    SET ${profile_fields.join(", ")}
                    WHERE user_id = ?
                `;
                profile_values.push(user_id);
    
                await database.query(updateProfileQuery, profile_values);
            }
    
            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: "Profile Completed Successfully"
            }));
    
        } catch (error) {
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: "SOME ERROR OCCURRED",
                data: error.message
            }));
        }
    }            

    async get_item_details(request_data, user_id, callback){
        try{
            const requested_data = JSON.parse(common.decryptPlain(request_data));
            const item_id = requested_data.item_id;

            const query = `select  ing.ingredient_name ,i.image_name,itd.name_,itd.kcal,itd.carbs_gm,itd.protein,itd.fat_gm,itd.about  
                            from tbl_item as itd
                            left join  ing_item_rel rinit on itd.item_id = rinit.item_id
                            left join tbl_ingredients ing on ing.ing_id= rinit.ing_id
                            left join tbl_images i on i.image_id = itd.image_id
                            where itd.item_id = ?;`;
            const [result] = await database.query(query, [item_id]);

            if(result.length === 0){
                return callback(common.encrypt({
                    code: response_code.DATA_NOT_FOUND,
                    message: "NO MEAL ITEM FOUND",
                    data: []
                }));
            }

            else{
                return callback(common.encrypt({
                    code: response_code.SUCCESS,
                    message: "SUCCESS",
                    data: result[0]
                }))
            }

        } catch(error){
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: "ERROR",
                data: error.message
            }))
        }
    }

    async add_delivery_address(requested_data, user_id, callback){
        try{
            const request_data = JSON.parse(common.decryptPlain(requested_data));

            const delivery_data = {
                latitude: request_data.latitude,
                longitude: request_data.longitude,
                area_name: request_data.area_name,
                flat_number: request_data.flat_number,
                block_number: request_data.block_number,
                road_name: request_data.road_name,
                delivery_info: request_data.delivery_info,
                type_: request_data.type_
            }

            const query = `INSERT INTO tbl_delivery_address SET ?`;
            const [res] = await database.query(query, [delivery_data]);
            const insertId = res.insertId;

            const update_user_info = `update tbl_user set delivery_address = ? where user_id = ?`;
            await database.query(update_user_info, [insertId, user_id]);
            
            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: "SUCCESS"
            }));

        } catch(error){
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: "ERROR",
                data: error.message
            }));
        }
    }
    
    async help_support(requested_data, user_id, callback){
        try{
            const request_data = JSON.parse(common.decryptPlain(requested_data));
            const help_data = {
                user_id: user_id,
                full_name: request_data.full_name,
                phone_number: request_data.phone_number,
                email_id: request_data.email_id,
                descp: request_data.descp
            }

            const query = `INSERT INTO tbl_help_support SET ?`
            await database.query(query, [help_data]);

            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: "SUCCESS"
            }));

        } catch(error){
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: "ERROR",
                data: error.message
            }));
        }
    }

    async list_notifications(user_id, callback){
        try{
            // const request_data = JSON.parse(common.decryptPlain(requested_data));
            const query = `SELECT * from tbl_notification where user_id = ?`;
            const [notifications] = await database.query(query, [user_id]);
            if(notifications.length === 0){
                return callback(common.encrypt({
                    code: response_code.NOT_FOUND,
                    message: "NO NOTIFICATION FOUND",
                    data: []
                }));
            }

            return callback(common.encrypt({
                code: response_code.SUCCESS,
                    message: "NOTIFICATIONS",
                    data: notifications
            }));

        } catch(error){
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                    message: "ERROR",
                    data: error.message
            }));
        }
    }

    async make_order(requested_data, user_id, callback) {
        try {
            const request_data = JSON.parse(common.decryptPlain(requested_data));
            const meals = request_data.meals;
            const category = request_data.category;
    
            if (!meals || meals.length === 0) {
                return callback(common.encrypt({
                    code: response_code.OPERATION_FAILED,
                    message: "No meals provided to place order"
                }));
            }
    
            const now = new Date();
            const delivery_time_start = new Date(now.getTime() + 2 * 60 * 60 * 1000);;
    
            const deliveryEndDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); 
            const delivery_time_end = deliveryEndDate; 
    
            const order_data = {
                user_id: user_id,
                delivery_id: request_data.delivery_id,
                note: request_data.note || null,
                status_: 'confirmed',
                delivery_time_start: delivery_time_start,
                delivery_time_end: delivery_time_end,
                total_qty: 0
            };
    
            const [orderRes] = await database.query(`INSERT INTO tbl_order SET ?`, [order_data]);
            const order_id = orderRes.insertId;
    
            for (const meal of meals) {
                const meal_data = {
                    order_id: order_id,
                    item_id: meal.item_id,
                    qty: meal.qty || 1,
                    category: category,
                    user_id: user_id
                };
                await database.query(`INSERT INTO tbl_meal SET ?`, [meal_data]);
            }
    
            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: "ORDER PLACED SUCCESSFULLY",
                data: { order_id: order_id }
            }));
    
        } catch (error) {
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: "ERROR PLACING ORDER",
                data: error.message
            }));
        }
    }
    
    async delete_account(user_id, callback){
        try{
            const queries = [
                `UPDATE tbl_user SET is_deleted = 1, is_active = 0, token = null, is_login = 0 WHERE user_id = ?`,
                `UPDATE tbl_otp SET is_deleted = 1, is_active = 0, verify = 0 WHERE user_id = ?`,
                `UPDATE tbl_order SET is_deleted = 1, is_active = 0 WHERE user_id = ?`,
                `UPDATE tbl_meal SET is_deleted = 1, is_active = 0 WHERE user_id = ?`,
                `UPDATE tbl_device_info SET is_deleted = 1, is_active = 0 WHERE user_id = ?`,
                `UPDATE tbl_notification SET is_deleted = 1, is_active = 0 WHERE user_id = ?`,
                `UPDATE tbl_help_support SET is_deleted = 1, is_active = 0 WHERE user_id = ?`
            ];

            for (const query of queries) {
                await database.query(query, [user_id]);
            }

            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: "ACCOUNT DELETED SUCCESSFULLY"
            }));

        } catch(error){
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: "ERROR",
                data: error.message
            }));
        }
    }

    async logout(user_id, callback) {
        try {
            const query = `UPDATE tbl_user SET is_login = 0, token = NULL WHERE user_id = ?`;
            const [result] = await database.query(query, [user_id]);
    
            if (result.affectedRows === 0) {
                return callback(common.encrypt({
                    code: response_code.DATA_NOT_FOUND,
                    message: "USER NOT FOUND OR ALREADY LOGGED OUT"
                }));
            }
            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: "LOGOUT SUCCESSFUL"
            }));
    
        } catch (error) {
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: "ERROR",
                data: error.message
            }));
        }
    }
    
    async show_order_details(requested_data, user_id, callback) {
        try {
            const request_data = JSON.parse(common.decryptPlain(requested_data));
            const order_id = request_data.order_id;
            const findOrder = `SELECT * FROM tbl_order WHERE user_id = ? AND order_id = ?`;
            const [result] = await database.query(findOrder, [user_id, order_id]);
    
            if (result.length === 0) {
                return callback(common.encrypt({
                    code: response_code.NOT_FOUND,
                    message: "No Data Found",
                    data: []
                }));
            }
    
            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: "FOUND",
                data: result
            }));
    
        } catch (error) {
            console.error("Order details fetch error:", error);
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: "An error occurred while fetching order details.",
                data: null
            }));
        }
    }  

    async display_home_page(requested_data, user_id, callback){
        try{
            const query = `SELECT 
                            SUM(ti.kcal * tm.qty) AS total_kcal, 
                            SUM(ti.carbs_gm * tm.qty) AS total_carbs_gm,
                            SUM(ti.protein * tm.qty) AS total_protein,
                            SUM(ti.fat_gm * tm.qty) AS total_fat_gm
                        FROM 
                            tbl_meal tm
                        JOIN 
                            tbl_item ti ON tm.item_id = ti.item_id
                        WHERE 
                            tm.user_id = ?
                            AND tm.order_id IN (
                                SELECT order_id 
                                FROM tbl_order 
                                WHERE is_active = 1 
                                AND is_deleted = 0 
                                AND status_ IN ('confirmed', 'in_preparation', 'ofd')
                            );`

            const [result] = await database.query(query, [user_id]);
            console.log(result);

            if(result.length === 0){
                return callback(common.encrypt({
                    code: response_code.NOT_FOUND,
                    message: "NO DATA FOUND, MAKE ORDER"
                }));
            }

            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: "SUCCESS",
                data: result
            }));

        } catch(error){
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: "ERROR",
                data: error.message
            }));
        }
    }

    async change_password(requested_data, user_id, callback){
        const request_data = JSON.parse(common.decryptPlain(requested_data));

        var selectQuery = "SELECT * FROM tbl_user WHERE user_id = ? and is_login = 1";
        try {
            const [rows] = await database.query(selectQuery, [user_id]);
            
            if (!rows || rows.length === 0) {
                return callback(common.encrypt({
                    code: response_code.NOT_FOUND,
                    message: t('no_data_found')
                }));
            }
            const user = rows[0];
    
            const oldPasswordHash = md5(request_data.old_password);
            const newPasswordHash = md5(request_data.new_password);

            console.log(oldPasswordHash);
            console.log(user.password_);
            if (oldPasswordHash !== user.password_) {
                return callback(common.encrypt({
                    code: response_code.OPERATION_FAILED,
                    message: t('old_password_mismatch')
                }));
            }
    
            if (newPasswordHash === user.password_) {
                return callback(common.encrypt({
                    code: response_code.OPERATION_FAILED,
                    message: t('old_new_password_same')
                }));
            }
    
            const data = {
                password_: newPasswordHash
            };

            const updateQuery = "UPDATE tbl_user SET ? where user_id = ?";
            await database.query(updateQuery, [data, user_id]);

            const selectUser = "SELECT * FROM tbl_user where user_id = ?"
            const [result] = await database.query(selectUser, [user_id]);

            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: t('password_changed_success'),
                data: result
            }));
    
        } catch (error) {
            console.error('Change Password Error:', error);
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: error.message || t('password_change_error')
            }));
        }
    }

    async report(requested_data, user_id, callback){
        try{
            const request_data = JSON.parse(common.decryptPlain(requested_data));
            const report = request_data.report;

            const query = `INSERT INTO tbl_report (report, user_id) values (?, ?)`;
            await database.query(query, [report, user_id]);

            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: "REPORT POSTED SUCCESSFULLY"
            }));

        } catch(error){
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: "ERROR",
                data: error.message
            }));
        }
    }
}

module.exports = new userModel();