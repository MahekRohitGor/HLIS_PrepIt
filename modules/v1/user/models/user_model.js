const common = require("../../../../utilities/common");
const database = require("../../../../config/database");
const response_code = require("../../../../utilities/response-error-code");
const md5 = require("md5");
const {default: localizify} = require('localizify');
const en = require("../../../../language/en");
const fr = require("../../../../language/fr");
const guj = require("../../../../language/guj");
const validator = require("../../../../middlewares/validator");

const { t } = require('localizify');
const user = require("../controllers/user");

class userModel{
    async signup(request_data, callback) {
        try {
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
    
            console.log(data);
    
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
                    await common.updateOtp(user_id); // Function to update OTP
                    console.log("OTP updated for reactivated user");
    
                    return callback({
                        code: response_code.SUCCESS,
                        message: "Account reactivated. OTP sent for verification."
                    });
    
                } else {
                    // If user already verified
                    const findIsVerify = `SELECT * from tbl_otp where user_id = ? and verify = 1`;
                    const [data_verify] = await database.query(findIsVerify, [user_id]);
    
                    if (data_verify.length > 0) {
                        return callback({
                            code: response_code.OPERATION_FAILED,
                            message: "User already registered and verified, please login",
                            data: user_data_
                        });
                    } else {
                        // If user found but not verified, update OTP
                        console.log("here");
                        const otp_obj = request_data.otp ? { otp: request_data.otp } : {};
                        otp_obj.is_deleted = 0;
                        otp_obj.is_active = 1;
                        console.log(otp_obj);

                        common.updateUserInfo(user_id, otp_obj, (error, updateUser) => {
                            if (error) {
                                console.log(error);
                                return callback({
                                    code: response_code.OPERATION_FAILED,
                                    message: "EMAIL ID ALREADY PRESENT OR VERIFIED"
                                });
                            }
                            return callback({
                                code: response_code.SUCCESS,
                                message: "Successfully Verified",
                                data: updateUser
                            });
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
                        return callback({
                            code: response_code.OPERATION_FAILED,
                            message: t('rest_keywords_something_went_wrong', { username: request_data.user_name })
                        });
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
    
                        return callback({
                            code: response_code.VERIFICATION_PENDING,
                            message: t('rest_keywords_success') + "... " + t('verification_pending'),
                            data: userInfo
                        });
                    } else {
                        await database.query(`UPDATE tbl_user SET isstep_ = ? WHERE user_id = ?`, ['1', userId]);
                        return callback({
                            code: response_code.VERIFICATION_PENDING,
                            message: t('rest_keywords_success') + "... " + t('verification_profile_pending'),
                            data: userInfo
                        });
                    }
                });
            }
        } catch (error) {
            console.log("Signup Error: ", error);
            return callback({
                code: response_code.OPERATION_FAILED,
                message: t('rest_keywords_something_went_wrong', { username: request_data.user_name })
            });
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
            console.log("Requested data: ", request_data);

            const {email_id} = request_data;

            const selectUserQuery = "SELECT user_id FROM tbl_user WHERE email_id = ? and is_active = 1 and is_deleted = 0";
            const [userResult] = await database.query(selectUserQuery, [email_id]);

            if (userResult.length === 0) {
                return callback({
                    code: response_code.NOT_FOUND,
                    message: t('email_not_registered')
                });
            }

            const user_id = userResult[0].user_id;
    
            const selectUserWithUnverified = "SELECT * FROM tbl_otp WHERE user_id = ? and is_active = 1 and is_deleted = 0";
            const [result] = await database.query(selectUserWithUnverified, [user_id]);
    
            if (result.length === 0) {
                return callback({
                    code: response_code.OPERATION_FAILED,
                    message: t('otp_not_found')
                });
            }
    
            const userOtpData = result[0];
            const currentTime = new Date();
            const expireTime = new Date(userOtpData.expire_time);
    
            if (userOtpData.verify === 1) {
                return callback({
                    code: response_code.SUCCESS,
                    message: t('already_verified'),
                    data: userOtpData
                });
            }

            if (currentTime > expireTime) {
                const newOtp = common.generateOtp(4)
                const newExpireTime = new Date();
                newExpireTime.setHours(newExpireTime.getHours() + 1);
    
                const updateOtpQuery = "UPDATE tbl_otp SET otp = ?, expire_time = ? WHERE user_id = ?";
                await database.query(updateOtpQuery, [newOtp, newExpireTime, user_id]);
    
                return callback({
                    code: response_code.SUCCESS,
                    message: "OTP Expired. New OTP sent.",
                    data: { newOtp, expire_time: newExpireTime }
                });
            }
    
            if (request_data.otp === userOtpData.otp) {
                const updateUserQuery = "UPDATE tbl_otp SET verify = 1 WHERE user_id = ?";
                await database.query(updateUserQuery, [user_id]);

                const updateIsStepQuery = "UPDATE tbl_user SET isstep_ = ? WHERE user_id = ?";
                await database.query(updateIsStepQuery, ['2', user_id]);
    
                return callback({
                    code: response_code.SUCCESS,
                    message: t('otp_verify_success')
                });
            } else {
                return callback({
                    code: response_code.OPERATION_FAILED,
                    message: t('invalid_otp')
                });
            }
        } catch (error) {
            return callback({
                code: response_code.OPERATION_FAILED,
                message: t('some_error_occurred'),
                data: error
            });
        }
    }

    async resendOTP(request_data, callback){
        try{
        const {email_id} = request_data;
        const selectUserQuery = "SELECT user_id FROM tbl_user WHERE email_id = ? and is_active = 1 and is_deleted = 0";
        const [userResult] = await database.query(selectUserQuery, [email_id]);

        if (userResult.length === 0) {
            return callback({
                code: response_code.OPERATION_FAILED,
                message: t('email_not_registered')
            });
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

            return callback({
                code: response_code.SUCCESS,
                message: t('new_otp_generated_sent_msg'),
                data: { user_id, expire_time: newExpireTime }
            });
        }

        const { otp, expire_time, verify } = otpResult[0];
        const currentTime = new Date();
        if (verify === 1) {
            return callback({
                code: response_code.SUCCESS,
                message: t('otp_already_verified'),
            });
        }

        if (expire_time < currentTime || verify === 0) {
            const updateOtpQuery = `
                UPDATE tbl_otp SET otp = ?, expire_time = ?, verify = 0 WHERE user_id = ?
            `;
            await database.query(updateOtpQuery, [newOtp, newExpireTime, user_id]);

            console.log(`Updated OTP for User ID ${user_id}: ${newOtp}`);

            return callback({
                code: response_code.SUCCESS,
                message: t('new_otp_sent'),
                data: { user_id, expire_time: newExpireTime }
            });
        }
        }catch (error) {
        return callback({
            code: response_code.OPERATION_FAILED,
            message: t('some_error_occurred'),
            data: error
        });
    }
    }

    async forgotPassword(request_data, callback) {
        try {
            if (!request_data.email_id && !request_data.mobile_number) {
                return callback({
                    code: response_code.OPERATION_FAILED,
                    message: t('provide_email_or_mobile')
                });
            }
    
            const data = {};
            let userQuery = "SELECT * FROM tbl_user WHERE ";
            const queryConditions = [];
            const queryParams = [];
    
            if (request_data.email_id) {
                queryConditions.push("email_id = ?");
                queryParams.push(request_data.email_id);
            }
    
            if (request_data.mobile_number) {
                queryConditions.push("mobile_number = ?");
                queryParams.push(request_data.mobile_number);
            }
    
            userQuery += queryConditions.join(" OR ");
    
            const [userResult] = await database.query(userQuery, queryParams);
    
            if (userResult.length === 0) {
                return callback({
                    code: response_code.OPERATION_FAILED,
                    message: t('user_not_found_signup_req')
                });
            }
    
            const user = userResult[0];
            const resetToken = common.generateToken(10);
            
            const tokenData = {
                reset_token: resetToken,
                expires_at: new Date(Date.now() + 3600000)
            };
    
            if (request_data.email_id) {
                tokenData.email_id = request_data.email_id;
                tokenData.mobile_number = null;
            } else if (request_data.mobile_number) {
                tokenData.mobile_number = request_data.mobile_number;
                tokenData.email_id = null;
            }
    
            await database.query("INSERT INTO tbl_forgot_passwords SET ?", tokenData);
            
            return callback({
                code: response_code.SUCCESS,
                message: t('password_reset_token_sent')
            });
    
        } catch(error) {
            console.error(error);
            return callback({
                code: response_code.OPERATION_FAILED,
                message: error.sqlMessage || t('forgot_password_error')
            });
        }
    }

    async resetPassword(requested_data, callback){
        const { reset_token, new_password } = requested_data;
        console.log(reset_token);
    
        try {
            const selectTokenQuery = `
                SELECT email_id, mobile_number FROM tbl_forgot_passwords 
                WHERE reset_token = '${reset_token}' AND is_active = 1 AND expires_at > NOW()
            `;
            console.log(selectTokenQuery);
    
            const [result] = await database.query(selectTokenQuery);
            console.log(result);
    
            if (!result.length) {
                return callback({
                    code: response_code.NOT_FOUND,
                    message: t('invalid_expired_reset_token')
                });
            }
    
            const email_id = result[0].email_id;
            const mobile_number = result[0].mobile_number;
            const hashedPassword = md5(new_password);
    
            const updatePasswordQuery = "UPDATE tbl_user SET passwords = ? WHERE email_id = ? or mobile_number = ?";
            await database.query(updatePasswordQuery, [hashedPassword, email_id, mobile_number]);
    
            const deactivateTokenQuery = "UPDATE tbl_forgot_passwords SET is_active = 0 WHERE reset_token = ?";
            await database.query(deactivateTokenQuery, [reset_token]);
    
            return callback({
                code: response_code.SUCCESS,
                message: t('password_reset_success')
            });
    
        } catch (error) {
            return callback({
                code: response_code.OPERATION_FAILED,
                message: error.sqlMessage || t('password_reset_error')
            });
        }
    }

    async login(request_data, callback){
        const user_data = {};
        if(request_data.email_id != undefined && request_data.email_id != ""){
            user_data.email_id = request_data.email_id;
        }
        if(request_data.mobile_number != undefined && request_data.mobile_number != ""){
            user_data.mobile_number = request_data.mobile_number;
        }
        if(request_data.passwords != undefined){
            user_data.passwords = md5(request_data.passwords);
        }

        var selectUserWithCred = "SELECT * FROM tbl_user WHERE (email_id = ? AND passwords = ?) or (mobile_number = ? and passwords = ?)";
        var params = [user_data.email_id, user_data.passwords, user_data.mobile_number, user_data.passwords];

        try{
            const [status] = await database.query(selectUserWithCred, params);

            if (status.length === 0) {
                return callback({
                    code: response_code.NOT_FOUND,
                    message: t('no_data_found')
                });
            }

            const user_id = status[0].user_id;

            const token = common.generateToken(40);
            const updateTokenQuery = "UPDATE tbl_user SET token = ?, is_login = 1 WHERE user_id = ?";
            await database.query(updateTokenQuery, [token, user_id]);

            const device_token = common.generateToken(40);
            const updateDeviceToken = "UPDATE tbl_device_info SET device_token = ? WHERE user_id = ?";
            await database.query(updateDeviceToken, [device_token, user_id]);

            common.getUserDetailLogin(user_id, (err, userInfo)=>{
                // console.log("getUserDetailLogin callback:", err, userInfo);
                if(err){
                    console.log("Error here", err);
                    return callback({
                        code: response_code.OPERATION_FAILED,
                        message: t('no_data_found')
                    });
                }
                else{
                    userInfo.token = token;
                    userInfo.device_token = device_token;
                    return callback({
                        code: response_code.SUCCESS,
                        message: t('login_success'),
                        data: userInfo
                    });

                }
            });

        } catch(error){
            return callback({
                code: response_code.OPERATION_FAILED,
                message: error.sqlMessage || t('login_error')
            });
        }
    }

}

module.exports = new userModel();