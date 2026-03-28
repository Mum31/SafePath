import React, { useEffect, useState } from 'react';
import { LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/useAuth';
import '../App.css';

const EMPTY_REGISTER_FORM = {
  username: '',
  email: '',
  firstName: '',
  lastName: '',
  password: '',
  passwordConfirm: '',
};

export default function AuthPage() {
  const { authLoading, isAuthenticated, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [registerForm, setRegisterForm] = useState(EMPTY_REGISTER_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const redirectTo = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate, redirectTo]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await login({ identifier, password });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setFormError(error.message || 'Connexion impossible');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await register(registerForm);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setFormError(error.message || 'Inscription impossible');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-page">
      <div className="auth-card">
        <div className="auth-hero">
          <div className="auth-badge">
            <ShieldCheck size={18} />
            Espace securise
          </div>
          <h1>Connectez-vous a votre espace SafePath</h1>
          <p>JWT securise l’acces a vos preferences, vos parcours personalises et vos futures donnees privees.</p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setFormError('');
            }}
          >
            <LogIn size={16} /> Connexion
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => {
              setMode('register');
              setFormError('');
            }}
          >
            <UserPlus size={16} /> Inscription
          </button>
        </div>

        {mode === 'login' ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <label className="auth-field">
              <span>Nom d’utilisateur ou email</span>
              <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} required />
            </label>
            <label className="auth-field">
              <span>Mot de passe</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {formError && <div className="auth-error">{formError}</div>}
            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="auth-grid">
              <label className="auth-field">
                <span>Prenom</span>
                <input
                  value={registerForm.firstName}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, firstName: event.target.value }))}
                />
              </label>
              <label className="auth-field">
                <span>Nom</span>
                <input
                  value={registerForm.lastName}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, lastName: event.target.value }))}
                />
              </label>
            </div>
            <label className="auth-field">
              <span>Nom d’utilisateur</span>
              <input
                value={registerForm.username}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, username: event.target.value }))}
                required
              />
            </label>
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                value={registerForm.email}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
            </label>
            <div className="auth-grid">
              <label className="auth-field">
                <span>Mot de passe</span>
                <input
                  type="password"
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
              </label>
              <label className="auth-field">
                <span>Confirmation</span>
                <input
                  type="password"
                  value={registerForm.passwordConfirm}
                  onChange={(event) =>
                    setRegisterForm((prev) => ({ ...prev, passwordConfirm: event.target.value }))
                  }
                  required
                />
              </label>
            </div>
            {formError && <div className="auth-error">{formError}</div>}
            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? 'Creation...' : 'Creer mon compte'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
