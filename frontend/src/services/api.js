import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const calculateRoute = async (origin, destination, preferences) => {
  const response = await api.post('/calculate-route/', {
    origin,
    destination,
    preferences
  });
  return response.data;
};

export const getEmergencyCalmZone = async (lat, lng, radius = 500) => {
  const response = await api.get('/emergency-calm-zone/', {
    params: { lat, lng, radius }
  });
  return response.data;
};

export const getCrowdData = async (bbox) => {
  const response = await api.get('/crowd-data/', {
    params: { bbox: bbox.join(',') }
  });
  return response.data;
};

export const saveUserPreferences = async (userId, preferences) => {
  const response = await api.post('/user-preferences/', {
    user_id: userId,
    ...preferences
  });
  return response.data;
}; 
