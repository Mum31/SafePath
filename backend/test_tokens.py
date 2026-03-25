import os
import sys
import requests
from dotenv import load_dotenv

# Charge les variables d'environnement
load_dotenv()

def check_token(token_name, token_value):
    """Vérifie si un token est défini"""
    if not token_value:
        print(f"❌ {token_name}: NON DÉFINI")
        return False
    elif token_value.startswith('ton_token_') or 'change_me' in token_value:
        print(f"⚠️  {token_name}: VALEUR PAR DÉFAUT DÉTECTÉE")
        return False
    else:
        print(f"✅ {token_name}: PRÉSENT ({len(token_value)} caractères)")
        return True

def test_mapbox_token(token):
    """Teste le token Mapbox"""
    if not token:
        return False
    
    try:
        # Test simple de validité format
        if token.startswith('pk.'):
            print("✅ Mapbox: Format token public valide (pk.)")
            return True
        elif token.startswith('sk.'):
            print("✅ Mapbox: Format token secret valide (sk.)")
            return True
        else:
            print("⚠️  Mapbox: Format token inconnu")
            return False
    except:
        return False

def test_tomtom_token(token):
    """Teste le token TomTom"""
    if not token:
        return False
    
    # Test API TomTom
    test_url = "https://api.tomtom.com/search/2/geocode/Paris.json"
    params = {
        'key': token,
        'limit': 1
    }
    
    try:
        response = requests.get(test_url, params=params, timeout=5)
        if response.status_code == 200:
            print("✅ TomTom: Token valide (API répond)")
            return True
        elif response.status_code == 403:
            print("❌ TomTom: Token invalide ou expiré")
            return False
        else:
            print(f"⚠️  TomTom: Code {response.status_code} - Vérifie le token")
            return False
    except Exception as e:
        print(f"⚠️  TomTom: Erreur de connexion - {str(e)[:50]}")
        return False

def test_openweather_token(token):
    """Teste le token OpenWeather"""
    if not token:
        return False
    
    # Test API OpenWeather
    test_url = "https://api.openweathermap.org/data/2.5/weather"
    params = {
        'q': 'Paris',
        'appid': token,
        'units': 'metric'
    }
    
    try:
        response = requests.get(test_url, params=params, timeout=5)
        if response.status_code == 200:
            print("✅ OpenWeather: Token valide")
            return True
        elif response.status_code == 401:
            print("❌ OpenWeather: Token invalide")
            return False
        else:
            print(f"⚠️  OpenWeather: Code {response.status_code}")
            return False
    except Exception as e:
        print(f"⚠️  OpenWeather: Erreur de connexion")
        return False

def main():
    print("=" * 50)
    print("VÉRIFICATION DES TOKENS API")
    print("=" * 50)
    
    # Récupère les tokens
    tokens = {
        'MAPBOX_TOKEN': os.getenv('VITE_MAPBOX_TOKEN') or os.getenv('MAPBOX_TOKEN'),
        'TOMTOM_API_KEY': os.getenv('TOMTOM_API_KEY'),
        'OPENWEATHER_API_KEY': os.getenv('OPENWEATHER_API_KEY'),
    }
    
    results = {}
    
    # Vérifie chaque token
    for name, value in tokens.items():
        print(f"\n{name}:")
        if name == 'MAPBOX_TOKEN':
            results[name] = check_token(name, value) and test_mapbox_token(value)
        elif name == 'TOMTOM_API_KEY':
            results[name] = check_token(name, value) and test_tomtom_token(value)
        elif name == 'OPENWEATHER_API_KEY':
            results[name] = check_token(name, value) and test_openweather_token(value)
    
    print("\n" + "=" * 50)
    print("RÉSUMÉ:")
    print("=" * 50)
    
    valid_count = sum(results.values())
    total_count = len(results)
    
    for name, is_valid in results.items():
        status = "✅ VALIDE" if is_valid else "❌ INVALIDE/MANQUANT"
        print(f"{name}: {status}")
    
    print(f"\nTotal: {valid_count}/{total_count} tokens valides")
    
    if valid_count == total_count:
        print("\n🎉 TOUS LES TOKENS SONT VALIDES !")
    elif valid_count >= 1:
        print(f"\n⚠️  {valid_count}/{total_count} tokens valides - Certaines fonctionnalités seront limitées")
    else:
        print("\n🚨 AUCUN TOKEN VALIDE - L'application fonctionnera en mode limité")

if __name__ == "__main__":
    main()