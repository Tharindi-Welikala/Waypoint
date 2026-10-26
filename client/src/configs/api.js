import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_BASEURL,
});

// Configure the API with a token getter
let getTokenFn = null;

export const configureApiAuth = (getToken) => {
    getTokenFn = getToken;
};

// Add a request interceptor to automatically attach auth token
api.interceptors.request.use(
    async (config) => {
        if (getTokenFn) {
            try {
                const token = await getTokenFn();
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
            } catch (error) {
                console.error('Error getting auth token:', error);
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default api;