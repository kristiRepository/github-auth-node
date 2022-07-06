import mysql from "mysql"
import { databaseOptions } from "./config.js"

export const connection = mysql.createConnection(databaseOptions);


