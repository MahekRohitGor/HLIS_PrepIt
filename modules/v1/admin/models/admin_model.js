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

class adminModel {
    async admin_login(requested_data, callback){
        try{
            const request_data = JSON.parse(common.decryptPlain(requested_data));
            const { username, password } = request_data;

            if (!username || !password) {
                return callback(common.encrypt({
                    code: response_code.BAD_REQUEST,
                    message: "Email and Password are required"
                }));
            }
            // const pswd = md5(password);

            var query = `SELECT * from tbl_admin where admin_username = ? and admin_password = ?`;
            var [result] = await database.query(query, [username, password]);
            if(result.length === 0){
                return callback(common.encrypt({
                    code: response_code.UNAUTHORIZED,
                    message: "Please Login with Correct Admin Credentials"
                }));
            }

            const token = common.generateToken(40);
            const updateUser = `UPDATE tbl_admin set token = ?, is_login = 1 where admin_username = ?`;
            await database.query(updateUser, [token, username]);

            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: "Admin Login Success"
            }))

        } catch(error){
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: "ERROR",
                data: error.message
            }));
        }
    }

    async add_items(requested_data, callback) {
        try {
            const request_data = JSON.parse(common.decryptPlain(requested_data));
            const { image_name, name_, kcal, carbs_gm, protein, fat_gm, about, ingredients } = request_data;
    
            if (!image_name || !name_ || !ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
                return callback(common.encrypt({
                    code: response_code.BAD_REQUEST,
                    message: "Image name, item name, and ingredients are required"
                }));
            }
    
            const insertImageQuery = `INSERT INTO tbl_images (image_name) VALUES (?);`;
            const [imageResult] = await database.query(insertImageQuery, [image_name]);
            const image_id = imageResult.insertId;
    
            const insertItemQuery = `INSERT INTO tbl_item (image_id, name_, kcal, carbs_gm, protein, fat_gm, about) VALUES (?,?,?,?,?,?,?);`;
            const [itemResult] = await database.query(insertItemQuery, [image_id, name_, kcal, carbs_gm, protein, fat_gm, about]);
            const item_id = itemResult.insertId;
    
            for (const ingredient_name of ingredients) {
                const [existingIng] = await database.query(`SELECT ing_id FROM tbl_ingredients WHERE ingredient_name = ?;`, [ingredient_name]);
                let ing_id;
    
                if (existingIng.length > 0) {
                    ing_id = existingIng[0].ing_id;
                } else {
                    const [insertIng] = await database.query(`INSERT INTO tbl_ingredients (ingredient_name) VALUES (?);`, [ingredient_name]);
                    ing_id = insertIng.insertId;
                }
                await database.query(`INSERT INTO ing_item_rel (ing_id, item_id) VALUES (?,?);`, [ing_id, item_id]);
            }
    
            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: "Item and ingredients added successfully",
                data: {
                    item_id: item_id,
                    image_id: image_id
                }
            }));
    
        } catch (error) {
            console.error("Error in add_items:", error);
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: "An error occurred",
                data: error.message
            }));
        }
    }      

    async analytics(requested_data, callback) {
        try {
            const queries = {
                non_active_users: `SELECT COUNT(*) AS non_active_users FROM tbl_user WHERE is_active = 0;`,
                active_users: `SELECT COUNT(*) AS active_users FROM tbl_user WHERE is_active = 1;`,
                total_logins: `SELECT COUNT(*) AS total_logins FROM tbl_user WHERE is_login = 1 and is_active = 1 and is_deleted = 0;`,
                orders_confirmed: `SELECT COUNT(*) AS confirmed_orders FROM tbl_order WHERE status_ = 'confirmed' and is_active = 1 and is_deleted = 0;`,
                orders_completed: `SELECT COUNT(*) AS completed_orders FROM tbl_order WHERE status_ = 'complete' and is_active = 1 and is_deleted = 0;`
            };
    
            const [nonactiveUsersResult] = await database.query(queries.non_active_users);
            const [activeuserResult] = await database.query(queries.active_users);
            const [totalLoginsResult] = await database.query(queries.total_logins);
            const [ordersConfirmedResult] = await database.query(queries.orders_confirmed);
            const [ordersCompletedResult] = await database.query(queries.orders_completed);
    
            const responseData = {
                nonactiveUsers: nonactiveUsersResult[0].non_active_users,
                active_user: activeuserResult[0].active_users,
                total_logins: totalLoginsResult[0].total_logins,
                orders_confirmed: ordersConfirmedResult[0].confirmed_orders,
                orders_completed: ordersCompletedResult[0].completed_orders
            };
    
            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: "Analytics fetched successfully",
                data: responseData
            }));
    
        } catch (error) {
            console.error("Error in analytics:", error);
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: "Failed to fetch analytics",
                data: error.message
            }));
        }
    }
    
    async admin_logout(admin_id, callback){
        try{
            const findAdmin = `SELECT * from tbl_admin where id = ${admin_id} and is_login = 1`;
            const [result] = await database.query(findAdmin);
            if(result.length === 0){
                return callback(common.encrypt({
                    code: response_code.NOT_FOUND,
                    message: "ADMIN NOT FOUND",
                    data: result
                }));
            }

            const query = `UPDATE tbl_admin SET token = null, is_login = 0 where id = ${admin_id}`;
            const [data] = await database.query(query);

            return callback(common.encrypt({
                code: response_code.SUCCESS,
                message: "SUCCESSFULLY LOGOUT"
            }))

        } catch(error){
            return callback(common.encrypt({
                code: response_code.OPERATION_FAILED,
                message: "ERROR OCCURED",
                data: error.message
            }));
        }
    }
}

module.exports = new adminModel();