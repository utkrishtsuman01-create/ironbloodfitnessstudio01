import { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";

const API = "/api/auth";
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);

    useEffect(() => {
        // CRITICAL: If returning from the Google OAuth callback, skip the /me check.
        // AuthCallback exchanges the session_id and establishes the session first.
        if (window.location.hash?.includes("session_id=")) return;
        (async () => {
            try {
                const res = await axios.get(`${API}/me`);
                setUser(res.data);
            } catch {
                try {
                    await axios.post(`${API}/refresh`);
                    const res = await axios.get(`${API}/me`);
                    setUser(res.data);
                } catch {
                    setUser(false);
                }
            }
        })();
    }, []);

    const login = useCallback(async (phone, password) => {
        const res = await axios.post(`${API}/login`, { phone, password });
        setUser(res.data);
        return res.data;
    }, []);

    const signup = useCallback(async (payload) => {
        const res = await axios.post(`${API}/signup`, payload);
        setUser(res.data);
        return res.data;
    }, []);

    const googleSession = useCallback(async (sessionId) => {
        const res = await axios.post(`${API}/google/session`, { session_id: sessionId });
        setUser(res.data);
        return res.data;
    }, []);

    const logout = useCallback(async () => {
        try {
            await axios.post(`${API}/logout`);
        } catch {
            /* session already gone */
        }
        setUser(false);
    }, []);

    return (
        <AuthContext.Provider value={{ user, isOwner: Boolean(user && user.is_owner), login, signup, googleSession, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
