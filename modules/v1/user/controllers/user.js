var userModel = require("../models/user_model");
var common = require("../../../../utilities/common");
const response_code = require("../../../../utilities/response-error-code");
const {default: localizify} = require('localizify');
const validator = require("../../../../middlewares/validator");
const { t } = require('localizify');
const vrules = require("../../../validation_rules");

class User{
    async signup(req,res){
        const request_data = req.body;
        userModel.signup(request_data, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async verifyOtp(req,res){
        const request_data = req.body;
        userModel.verifyOtp(request_data, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async resendOTP(req,res){
        const request_data = req.body;
        userModel.resendOTP(request_data, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async forgotPassword(req,res){
        const request_data = req.body;
        userModel.forgotPassword(request_data, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async resetPassword(req,res){
        const request_data = req.body;
        userModel.resetPassword(request_data, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

    async login(req,res){
        const request_data = req.body;
        userModel.login(request_data, (_response_data)=>{
            common.response(res, _response_data);
        });
    }

}


module.exports = new User();