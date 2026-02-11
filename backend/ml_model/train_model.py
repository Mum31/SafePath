"""
Entraînement du modèle de prédiction de densité.
Utilise les données historiques pour apprendre les patterns zone/horaire.
"""
import os
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
import joblib

HISTORY_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'historical', 'density_history.csv')
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'models')
MODEL_PATH = os.path.join(MODEL_DIR, 'density_model.joblib')


def train():
    """Entraîne le modèle sur les données historiques"""
    if not os.path.exists(HISTORY_PATH):
        print(f"Fichier {HISTORY_PATH} manquant. Créez des données d'entraînement.")
        return None

    df = pd.read_csv(HISTORY_PATH)
    if len(df) < 10:
        print("Pas assez de données pour l'entraînement (min 10 lignes)")
        return None

    # Features
    X = df[['lat', 'lng', 'hour', 'day_of_week', 'is_weekend']].values
    y = df['density'].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    model = RandomForestRegressor(n_estimators=50, max_depth=8, random_state=42)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    print(f"MAE sur test: {mae:.3f}")

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    print(f"Modèle sauvegardé: {MODEL_PATH}")

    return model


if __name__ == '__main__':
    train()
