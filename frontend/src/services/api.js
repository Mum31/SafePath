import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const ACCESS_TOKEN_KEY = 'safepath.auth.access';
const REFRESH_TOKEN_KEY = 'safepath.auth.refresh';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const getStoredItem = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const setStoredItem = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return undefined;
  }
};

const removeStoredItem = (key) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    return undefined;
  }
};

export const getAccessToken = () => getStoredItem(ACCESS_TOKEN_KEY);
export const getRefreshToken = () => getStoredItem(REFRESH_TOKEN_KEY);

export const syncAuthHeader = () => {
  const accessToken = getAccessToken();
  if (accessToken) {
    axios.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
    api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
  } else {
    delete axios.defaults.headers.common.Authorization;
    delete api.defaults.headers.common.Authorization;
  }
};

export const setAuthTokens = ({ access, refresh }) => {
  if (access) {
    setStoredItem(ACCESS_TOKEN_KEY, access);
  }
  if (refresh) {
    setStoredItem(REFRESH_TOKEN_KEY, refresh);
  }
  syncAuthHeader();
};

export const clearAuthTokens = () => {
  removeStoredItem(ACCESS_TOKEN_KEY);
  removeStoredItem(REFRESH_TOKEN_KEY);
  syncAuthHeader();
};

export const refreshAccessSession = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('Aucune session a restaurer');
  }

  const response = await axios.post(`${API_BASE_URL}/auth/refresh/`, {
    refresh_token: refreshToken,
  });
  setAuthTokens(response.data.tokens || {});
  return response.data;
};

syncAuthHeader();

export { api, API_BASE_URL };

export const calculateRoute = async (origin, destination, preferences) => {
  const response = await api.post('/calculate-route/', {
    origin,
    destination,
    preferences,
  });
  return response.data;
};

export const getCrowdData = async (bbox) => {
  const response = await api.get('/crowd-data/', {
    params: { bbox: bbox.join(',') },
  });
  return response.data;
};

export const saveUserPreferences = async (userId, preferences) => {
  const response = await api.post('/user-preferences/', {
    user_id: userId,
    ...preferences,
  });
  return response.data;
};

export const sendChatbotMessage = async (message, history = []) => {
  const response = await api.post('/chatbot/', {
    message,
    history,
  });
  return response.data;
};
