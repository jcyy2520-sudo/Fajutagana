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

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF PROVIDED_KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Log = sequelize.define("Log", {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID of the user who performed the action'
  },
  userName: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Name of the user for easier identification'
  },
  action: {
    type: DataTypes.ENUM(
      'CREATE_ORDER',
      'UPDATE_ORDER',
      'DELETE_ORDER',
      'CREATE_EMPLOYEE',
      'UPDATE_EMPLOYEE',
      'DELETE_EMPLOYEE',
      'CREATE_MENU_ITEM',
      'UPDATE_MENU_ITEM',
      'DELETE_MENU_ITEM',
      'CREATE_MENU_CATEGORY',
      'UPDATE_MENU_CATEGORY',
      'DELETE_MENU_CATEGORY',
      'LOGIN',
      'LOGOUT',
      'UPDATE_PASSWORD',
      'UPDATE_PROFILE',
      'ASSIGN_STATION',
      'ASSIGN_CATEGORIES',
      'OTHER'
    ),
    allowNull: false,
    comment: 'Type of action performed'
  },
  module: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Module affected (orders, employees, menu, etc.)'
  },
  entityId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID of the entity affected by the action'
  },
  entityType: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Type of entity (Order, Employee, MenuItem, etc.)'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Detailed description of the action'
  },
  changes: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Before/after values for update actions'
  },
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'IP address of the requester'
  },
  status: {
    type: DataTypes.ENUM('success', 'failed', 'pending'),
    defaultValue: 'success',
    allowNull: false,
    comment: 'Whether the action succeeded or failed'
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Error message if action failed'
  }
}, {
  indexes: [
    { fields: ['userId'] },
    { fields: ['action'] },
    { fields: ['module'] },
    { fields: ['entityType', 'entityId'] },
    { fields: ['createdAt'] }
  ]
});

export { sequelize };
