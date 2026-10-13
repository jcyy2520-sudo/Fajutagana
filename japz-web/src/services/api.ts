import axios from 'axios';

// For local dev, point to local backend; for production use Railway
// Replace localhost with network IP for mobile device access
const getBaseUrl = () => {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) {
        const configured = new URL(envUrl);
        if (['localhost', '127.0.0.1'].includes(configured.hostname) && !['localhost', '127.0.0.1'].includes(window.location.hostname)) configured.hostname = window.location.hostname;
        return configured.toString().replace(/\/$/, '');
    }
    
    // Automatically detect hostname (works for localhost and network IP)
    const hostname = window.location.hostname;
    return `http://${hostname}:3000`;
};

const API_BASE_URL = getBaseUrl();

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,
});

// Add token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const getApiBaseUrl = () => API_BASE_URL;

export const authAPI = {
    login: (email: string, password: string) =>
        api.post('/api/auth/login', { email, password }),

    logout: async () => {
        try {
            const response = await api.post('/api/auth/logout');
            localStorage.removeItem('authToken');
            return response;
        } catch (error) {
            localStorage.removeItem('authToken');
            throw error;
        }
    },

    getCurrentUser: () => api.get('/api/auth/user'),

    updateProfile: (data: {
        name: string;
        email: string;
        currentPassword?: string;
        newPassword?: string;
    }) => api.put('/api/auth/profile', data),

};

export default api;
