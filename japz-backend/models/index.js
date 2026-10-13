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
import { User } from './userModel.js';
import { MenuCategory } from './menuCategoryModel.js';
import { MenuItem } from './menuItemModel.js';
import { Order } from './orderModel.js';
import { OrderItem } from './orderItemModel.js';
import { Payment } from './paymentModel.js';
import { Log } from './logModel.js';
import { StockMovement, StockAllocation, MenuRecipe, StockReceipt, StockCount, WasteReport } from './inventoryModels.js';
MenuCategory.hasMany(MenuItem, { foreignKey: 'categoryId', as: 'menuItems' });
MenuItem.belongsTo(MenuCategory, { foreignKey: 'categoryId', as: 'category' });

Order.belongsTo(User, { foreignKey: 'cashierId', as: 'cashier' });
Order.belongsTo(User, { foreignKey: 'preparedById', as: 'preparedBy' });
User.hasMany(Order, { foreignKey: 'cashierId', as: 'orders' });
User.hasMany(Order, { foreignKey: 'preparedById', as: 'preparedOrders' });

Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

Order.hasMany(Payment, { foreignKey: 'orderId', as: 'payments' });
Payment.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

OrderItem.belongsTo(MenuItem, { foreignKey: 'menuItemId', as: 'menuItem' });
MenuItem.hasMany(OrderItem, { foreignKey: 'menuItemId', as: 'orderItems' });

StockMovement.belongsTo(MenuItem, { as: 'menuItem', foreignKey: 'menuItemId', onDelete: 'RESTRICT' });
StockMovement.belongsTo(User, { as: 'user', foreignKey: 'userId', onDelete: 'RESTRICT' });
StockMovement.belongsTo(Order, { as: 'order', foreignKey: 'orderId', onDelete: 'RESTRICT' });
StockAllocation.belongsTo(Order, { foreignKey: 'orderId', onDelete: 'RESTRICT' });
MenuRecipe.belongsTo(MenuItem, { as: 'menuItem', foreignKey: 'menuItemId', onDelete: 'RESTRICT' });
for (const model of [StockReceipt, StockCount, WasteReport]) model.belongsTo(User, { as: 'user', foreignKey: 'userId', onDelete: 'RESTRICT' });

export { User, MenuCategory, MenuItem, Order, OrderItem, Payment, Log };
