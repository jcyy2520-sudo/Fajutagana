
/*
MIT License
 
Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { Sequelize } from "sequelize";
import 'dotenv/config';

// Support Railway's DATABASE_URL, MYSQL_URL, or MYSQL_PUBLIC_URL.
// Local development uses the DB_* variables below.
const DATABASE_URL = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL;

// Railway also provides individual MySQL variables
const MYSQL_HOST = process.env.MYSQLHOST || process.env.MYSQL_HOST;
const MYSQL_USER = process.env.MYSQLUSER || process.env.MYSQL_USER;
const MYSQL_PASSWORD = process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD;
const MYSQL_DATABASE = process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE;
const MYSQL_PORT = process.env.MYSQLPORT || process.env.MYSQL_PORT;

console.log('🔧 Database config check:');
console.log('  DATABASE_URL exists:', !!DATABASE_URL);
console.log('  MYSQL_HOST:', MYSQL_HOST);
console.log('  MYSQL_DATABASE:', MYSQL_DATABASE);

let sequelize;

if (DATABASE_URL) {
  // Use connection URL if provided
  console.log('📦 Using DATABASE_URL connection string');
  sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'mysql',
    dialectOptions: {
      ssl: process.env.NODE_ENV === 'production' ? {
        require: true,
        rejectUnauthorized: true
      } : false
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false
  });
} else if (MYSQL_HOST) {
  // Use Railway's individual MySQL variables
  console.log('📦 Using Railway MySQL individual variables');
  sequelize = new Sequelize(
    MYSQL_DATABASE || 'railway',
    MYSQL_USER || 'root',
    MYSQL_PASSWORD || '',
    {
      host: MYSQL_HOST,
      port: parseInt(MYSQL_PORT) || 3306,
      dialect: 'mysql',
      dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' ? {
          require: true,
          rejectUnauthorized: true
        } : false
      },
      logging: process.env.NODE_ENV === 'development' ? console.log : false
    }
  );
} else {
  // Local development fallback
  console.log('📦 Using local development database');
  sequelize = new Sequelize(
    process.env.DB_DATABASE || "japz_pos",
    process.env.DB_USER || "root",
    process.env.DB_PASSWORD || "",
    {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT, 10) || 3306,
      dialect: "mysql",
      logging: process.env.NODE_ENV === 'development' ? console.log : false
    }
  );
}

export { sequelize };