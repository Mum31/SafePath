import React from 'react';
import { Skeleton } from 'lucide-react'; // Mock, replace with divs if no UI lib

const DashboardSkeleton = () => (
  <div className="dashboard-skeleton">
    {/* Sidebar */}
    <aside className="skeleton-sidebar">
      <div className="skeleton-card wide" />
      <div className="skeleton-card tall" />
      <div className="skeleton-card" style={{ height: '160px' }} />
      <div className="skeleton-card" style={{ height: '140px' }} />
    </aside>

    {/* Main */}
    <main className="skeleton-main">
      {/* Hero */}
      <div className="skeleton-hero-grid">
        <div className="skeleton-hero">
          <div className="skeleton-line h1" />
          <div className="skeleton-line" />
          <div className="skeleton-stats-grid">
            <div className="skeleton-stat" />
            <div className="skeleton-stat" />
            <div className="skeleton-stat" />
          </div>
        <div className="skeleton-radar" />
      </div>

      {/* Toolbar */}
      <div className="skeleton-toolbar">
        <div className="skeleton-control" />
        <div className="skeleton-control wide" />
        <div className="skeleton-control" />
        <div className="skeleton-btn" />
      </div>

      {/* Panels */}
      <div className="skeleton-panels">
        <div className="skeleton-panel tall" />
        <div className="skeleton-panel" />
      </div>
    </main>

    <style jsx>{`
      .dashboard-skeleton {
        display: grid;
        grid-template-columns: 300px 1fr;
        gap: 1rem;
        padding: 1rem;
      }

      .skeleton-sidebar {
        display: flex;
        flex-direction
