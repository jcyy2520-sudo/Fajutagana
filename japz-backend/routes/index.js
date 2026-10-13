// Scoped extraction of the shared routes that Inventory directly uses.
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/userModel.js';
import { MenuItem } from '../models/menuItemModel.js';
import { MenuCategory } from '../models/menuCategoryModel.js';
import { createLog, getClientIp } from '../utils/logger.js';
import { authenticate, allowRoles } from '../middleware/access.js';
import { requireJwtSecret } from '../services/securityConfig.js';
import { readInventorySettings } from '../services/inventorySettings.js';
import { menuAvailability } from '../services/menuAvailability.js';
import { createInventoryOrder, changeOrderStatus } from '../services/inventoryOrders.js';
import inventoryRouter, { inventoryFailure } from './inventory.js';
const router = express.Router();
const verifyToken = authenticate;
const JWT_SECRET = requireJwtSecret();
router.use('/api/inventory', inventoryRouter);
router.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const ipAddress = getClientIp(req);

    // Validation
    if (!email || !password) {
      await createLog({
        action: 'LOGIN',
        module: 'auth',
        description: 'Login attempt with missing credentials',
        ipAddress,
        status: 'failed',
        errorMessage: 'Email and password required'
      });
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user in Users table
    let user = await User.findOne({ where: { email } });
    if (!user) {
      await createLog({
        action: 'LOGIN',
        module: 'auth',
        description: `Login attempt for non-existent user: ${email}`,
        ipAddress,
        status: 'failed',
        errorMessage: 'User not found'
      });
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    // Check if user account is pending approval
    if (user.status === 'pending') {
      await createLog({
        action: 'LOGIN',
        module: 'auth',
        userId: user.id,
        userName: user.name,
        description: `Login attempt by pending user: ${user.name}`,
        ipAddress,
        status: 'failed',
        errorMessage: 'Account pending approval'
      });
      return res.status(403).json({ error: 'Your account is pending admin approval. Please wait for an administrator to approve your account.' });
    }

    // Check if user account is rejected
    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'Your account has been rejected. Please contact an administrator.' });
    }

    // Check if employee is deactivated
    if (user.status === 'inactive') {
      await createLog({
        action: 'LOGIN',
        module: 'auth',
        userId: user.id,
        userName: user.name,
        description: `Login attempt by inactive user: ${user.name}`,
        ipAddress,
        status: 'failed',
        errorMessage: 'Account deactivated'
      });
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact an administrator.' });
    }

    // Compare password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      await createLog({
        action: 'LOGIN',
        module: 'auth',
        userId: user.id,
        userName: user.name,
        description: `Failed login attempt for user: ${user.name}`,
        ipAddress,
        status: 'failed',
        errorMessage: 'Incorrect password'
      });
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    // Create JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Log successful login
    await createLog({
      action: 'LOGIN',
      module: 'auth',
      userId: user.id,
      userName: user.name,
      description: `Successful login: ${user.name} (${user.email})`,
      ipAddress,
      status: 'success'
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        assignedCategories: user.assignedCategories || []
      }
    });
  } catch (error) {
    await createLog({
      action: 'LOGIN',
      module: 'auth',
      description: 'Login error',
      status: 'failed',
      errorMessage: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

// Logout (client-side, just removes token from storage)
router.post("/api/auth/logout", verifyToken, async (req, res) => {
  try {
    // Log the logout action
    await createLog({
      userId: req.user.id,
      userName: req.user.name,
      action: 'LOGOUT',
      module: 'AUTH',
      description: `User ${req.user.name} logged out`,
      status: 'success',
      ipAddress: getClientIp(req)
    });

    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Error logging logout:', error);
    // Still return success even if logging fails
    res.json({ message: 'Logout successful' });
  }
});
router.get("/api/auth/user", verifyToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        assignedCategories: user.assignedCategories || []
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user profile (name, email, password)
router.put("/api/auth/profile", verifyToken, async (req, res) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body;
    const ipAddress = getClientIp(req);

    // Validation
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Find user
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If password change is requested, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password required to change password' });
      }

      const passwordMatch = await bcrypt.compare(currentPassword, user.password);
      if (!passwordMatch) {
        await createLog({
          userId: user.id,
          userName: user.name,
          action: 'UPDATE_PROFILE',
          module: 'auth',
          description: 'Failed profile update: incorrect current password',
          ipAddress,
          status: 'failed',
          errorMessage: 'Current password is incorrect'
        });
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      user.password = await bcrypt.hash(newPassword, 10);
    }

    // Update user info
    user.name = name;
    user.email = email;
    await user.save();

    // Log the profile update
    await createLog({
      userId: user.id,
      userName: user.name,
      action: 'UPDATE_PROFILE',
      module: 'auth',
      description: `Profile updated: ${user.name} (${user.email})${newPassword ? ' with password change' : ''}`,
      changes: JSON.stringify({
        before: { name: req.user.name, email: req.user.email },
        after: { name, email, passwordChanged: !!newPassword }
      }),
      ipAddress,
      status: 'success'
    });

    res.json({
      message: 'Profile updated successfully',
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    await createLog({
      userId: req.user?.id,
      userName: req.user?.name || 'Unknown',
      action: 'UPDATE_PROFILE',
      module: 'auth',
      description: 'Profile update error',
      ipAddress: getClientIp(req),
      status: 'failed',
      errorMessage: error.message
    });
    res.status(500).json({ error: error.message });
  }
});
router.get('/api/menu-items', async (req, res) => {
  try { res.json(await menuAvailability({ includeRecipes: false, orderType: req.query.orderType || 'dine-in' })); } catch (error) { inventoryFailure(res, error); }
});
router.get('/api/menu-items/category/:categoryId', async (req, res) => {
  try { res.json((await menuAvailability({ includeRecipes: false, orderType: req.query.orderType || 'dine-in' })).filter(item => item.categoryId === Number(req.params.categoryId))); } catch (error) { inventoryFailure(res, error); }
});

// Create menu item
router.post("/api/menu-items", verifyToken, allowRoles('admin'), async (req, res) => {
  try {
    const { name, categoryId, price, description, hasSize, sizes, hasFlavor, flavors, hasTemperature, temperatures, trackStock, stock } = req.body;

    if (!name || !categoryId || !price) {
      return res.status(400).json({ error: 'Name, category, and price are required' });
    }

    // Check if category exists
    const category = await MenuCategory.findByPk(categoryId);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const item = await MenuItem.create({
      name,
      categoryId,
      price,
      description: description || '',
      hasSize: hasSize || false,
      sizes: sizes || null,
      hasFlavor: hasFlavor || false,
      flavors: flavors || null,
      hasTemperature: hasTemperature || false,
      temperatures: temperatures || null,
      trackStock: true, // Always on
      defaultStock: req.body.defaultStock || 0,
      stock: 0,
      reorderLevel: (await readInventorySettings()).defaultPreparedReorderLevel,
      status: 'available'
    });

    // Update category item count
    await category.increment('itemCount');

    // Fetch with category info
    const result = await MenuItem.findByPk(item.id, {
      include: [
        {
          model: MenuCategory,
          as: 'category',
          attributes: ['id', 'name'],
        }
      ]
    });

    res.status(201).json({
      message: 'Menu item created successfully',
      item: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.post('/api/orders', verifyToken, allowRoles('admin', 'cashier'), async (req, res) => {
  try {
    const result = await createInventoryOrder(req.body, req.user);
    await createLog({ userId: req.user.id, userName: req.user.name, action: 'CREATE_ORDER', module: 'orders', entityId: result.order.id, entityType: 'Order', description: 'Order accepted: ' + result.order.orderNumber, ipAddress: getClientIp(req), status: 'success' });
    res.status(201).json(result);
  } catch (error) { inventoryFailure(res, error); }
});
router.put('/api/orders/:id/status', verifyToken, allowRoles('admin', 'cashier', 'kitchen'), async (req, res) => {
  try {
    const result = await changeOrderStatus(req.params.id, req.body.status, req.user);
    await createLog({ userId: req.user.id, userName: req.user.name, action: 'UPDATE_ORDER', module: 'orders', entityId: result.order.id, entityType: 'Order', description: 'Order ' + result.order.orderNumber + ': ' + result.order.status, ipAddress: getClientIp(req), status: 'success' });
    res.json(result);
  } catch (error) { inventoryFailure(res, error); }
});

export default router;
