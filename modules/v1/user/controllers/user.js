var userModel = require("../models/user_model");
var common = require("../../../../utilities/common");
const response_code = require("../../../../utilities/response-error-code");
const {default: localizify} = require('localizify');
const validator = require("../../../../middlewares/validator");
const { t } = require('localizify');
const vrules = require("../../../validation_rules");

class User{
    async signup(req,res){
        const requested_data = req.body;
        const request_data = JSON.parse(common.decryptPlain(requested_data));

        const rules = vrules.signup;
        var message = {
            required: t('required'),
            email: t('email'),
            'phone_number.min': t('mobile_number_min'),
            'phone_number.regex': t('mobile_number_numeric'),
            'password_.min': t('passwords_min')
        }
        var keywords = {
            'email_id': t('rest_keywords_email_id'),
            'password_': t('rest_keywords_password')
        }

        const isValid = await validator.checkValidationRules(req, res, request_data, rules, message, keywords);
        if (!isValid) return;

        userModel.signup(request_data, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async verifyOtp(req,res){
        const requested_data = req.body;
        const request_data = JSON.parse(common.decryptPlain(requested_data));

        var rules = vrules.verifyOTP;
        var message = {
            required: t('required'),
            email: t('email'),
            'otp.min': t('otp_min')
        }
        var keywords = {
            'email_id': t('rest_keywords_email_id'),
            'otp': t('rest_keywords_otp')
        }

        const isValid = await validator.checkValidationRules(req, res, request_data, rules, message, keywords);
        if (!isValid) return;

        userModel.verifyOtp(request_data, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async resendOTP(req,res){
        const requested_data = req.body;
        const request_data = JSON.parse(common.decryptPlain(requested_data));
        var rules = vrules.resendOTP;
        var message = {
            required: t('required'),
            email: t('email')
        }
        var keywords = {
            'email_id': t('rest_keywords_email_id')
        }

        const isValid = await validator.checkValidationRules(req, res, request_data, rules, message, keywords);
        if (!isValid) return;

        userModel.resendOTP(request_data, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async forgotPassword(req,res){
        const requested_data = req.body;
        const request_data = JSON.parse(common.decryptPlain(requested_data));
        var rules = vrules.forgot_password;
        var message = {
            required: t('required'),
            email: t('email'),
            'phone_number.min': t('mobile_number_min'),
            'phone_number.regex': t('mobile_number_numeric')
        }
        var keywords = {
            'email_id': t('rest_keywords_email_id')
        }

        const isValid = await validator.checkValidationRules(req, res, request_data, rules, message, keywords);
        if (!isValid) return;

        userModel.forgotPassword(request_data, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async resetPassword(req,res){
        const requested_data = req.body;
        const request_data = JSON.parse(common.decryptPlain(requested_data));
        var rules = vrules.reset_password;
        var message = {
            required: t('required'),
            'reset_token.min': t('reset_token_min'),
            'reset_token.max': t('reset_token_max'),
            'new_password.min': t('new_password_min')
        }
        var keywords = {
            'reset_token': t('rest_keywords_reset_token'),
            'new_password': t('rest_keywords_new_password')
        }

        const isValid = await validator.checkValidationRules(req, res, request_data, rules, message, keywords);
        if (!isValid) return;

        userModel.resetPassword(request_data, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async login(req,res){
        const requested_data = req.body;
        const request_data = JSON.parse(common.decryptPlain(requested_data));
        
        var rules = vrules.login;
        var message = {
            required: t('required'),
            email: t('email'),
            'passwords.min': t('passwords_min')
        }
        var keywords = {
            'email_id': t('rest_keywords_email_id'),
            'passwords': t('rest_keywords_password')
        }

        const isValid = await validator.checkValidationRules(req, res, request_data, rules, message, keywords);
        if (!isValid) return;

        userModel.login(request_data, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async complete_profile(req,res){
        const requested_data = req.body;
        const request_data = JSON.parse(common.decryptPlain(requested_data));

        var rules = vrules.complete_profile;
        var message = {
            required: t('required')
        }
        var keywords = {
            'dob': t('rest_keywords_dob'),
            'gender': t('rest_keywords_gender')
        }
        const isValid = await validator.checkValidationRules(req, res, request_data, rules, message, keywords);
        if (!isValid) return;

        const user_id = req.user_id;
        userModel.complete_profile(request_data, user_id, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async get_item_details(req,res){
        const request_data = req.body;
        const user_id = req.user_id;
        userModel.get_item_details(request_data, user_id, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async add_delivery_address(req,res){
        const request_data = req.body;
        const user_id = req.user_id;
        userModel.add_delivery_address(request_data, user_id, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async help_support(req,res){
        const request_data = req.body;
        const user_id = req.user_id;
        userModel.help_support(request_data, user_id, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async list_notifications(req,res){
        const user_id = req.user_id;
        userModel.list_notifications(user_id, (_response_data)=>{
            common.response(res, _response_data);
        });
    }
    async make_order(req,res){
        const request_data = req.body;
        const user_id = req.user_id;
        userModel.make_order(request_data, user_id, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async logout(req,res){
        const user_id = req.user_id;
        userModel.logout(user_id, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async delete_account(req,res){
        const user_id = req.user_id;
        userModel.delete_account(user_id, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async show_order_details(req,res){
        const request_data = req.body;
        const user_id = req.user_id;
        userModel.show_order_details(request_data, user_id, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async display_home_page(req,res){
        const request_data = req.body;
        const user_id = req.user_id;
        userModel.display_home_page(request_data, user_id, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async change_password(req,res){
        const request_data = req.body;
        const user_id = req.user_id;
        userModel.change_password(request_data, user_id, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async report(req,res){
        const request_data = req.body;
        const user_id = req.user_id;
        userModel.report(request_data, user_id, (_response_data)=>{
            common.response(res, _response_data);
        });
    }
}


module.exports = new User();