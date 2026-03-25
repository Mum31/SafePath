import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, MapPin } from 'lucide-react';

const AlertsBanner = ({ alerts, onDismiss }) => {
  const item = alerts && alerts[0];

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          className="alerts-banner"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          role="alert"
        >
          <div className="alerts-banner-icon">
            <AlertCircle size={20} />
          </div>
          <div className="alerts-banner-content">
            <p className="alerts-banner-title">{item.title || 'Alerte temps réel'}</p>
            <p className="alerts-banner-message">{item.message}</p>
          </div>
          {onDismiss && (
            <button
              type="button"
              className="alerts-banner-dismiss"
              onClick={() => onDismiss(item.id)}
              aria-label="Fermer l’alerte"
            >
              ×
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AlertsBanner;
