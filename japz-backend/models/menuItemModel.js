import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { MenuCategory } from "./menuCategoryModel.js";

export const MenuItem = sequelize.define(
  "MenuItem",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    hasSize: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    sizes: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    hasFlavor: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    flavors: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    hasTemperature: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    temperatures: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: ['Hot', 'Cold'],
    },
    status: {
      type: DataTypes.ENUM('available', 'unavailable'),
      defaultValue: 'available',
      allowNull: false,
    },
    inventoryMode: { type: DataTypes.ENUM('prepared', 'recipe'), allowNull: false, defaultValue: 'prepared' },
    reservedStock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    reorderLevel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
    trackStock: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
    stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    defaultStock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    lastStockReset: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      defaultValue: null,
    },
    archived: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  },
  {
    tableName: "menu_items",
    timestamps: true,
  }
);

MenuCategory.hasMany(MenuItem, {
  foreignKey: 'categoryId',
  as: 'items',
});
