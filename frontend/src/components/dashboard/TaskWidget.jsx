/**
 * TaskWidget - Dashboard widget for tasks
 * Shows overdue, today, and upcoming tasks
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../services/apiClient';
import { useToast } from '../ui/Toast';

function TaskWidget({ onCreateTask }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [tasks, setTasks] = useState({ overdue: [], today: [], upcoming: [] });
  const [activeTab, setActiveTab] = useState('today');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, overdueRes, todayRes, upcomingRes] = await Promise.all([
        api.get('/tasks/stats'),
        api.get('/tasks/overdue'),
        api.get('/tasks/today'),
        api.get('/tasks/upcoming?days=7')
      ]);

      setStats(statsRes.data?.data || statsRes.data);
      setTasks({
        overdue: overdueRes.data?.data || overdueRes.data || [],
        today: todayRes.data?.data || todayRes.data || [],
        upcoming: upcomingRes.data?.data || upcomingRes.data || []
      });
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTask = async (taskId, e) => {
    e.stopPropagation();
    try {
      await api.put(`/tasks/${taskId}/complete`);
      toast.success('Task completed');
      fetchData();
    } catch (error) {
      toast.error('Failed to complete task');
    }
  };

  const getActiveTasks = () => {
    switch (activeTab) {
      case 'overdue': return tasks.overdue;
      case 'today': return tasks.today;
      case 'upcoming': return tasks.upcoming;
      default: return tasks.today;
    }
  };

  const formatTime = (time) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  };

  const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return '#ef4444';
      case 'high': return '#f59e0b';
      case 'normal': return '#3b82f6';
      case 'low': return '#9ca3af';
      default: return '#3b82f6';
    }
  };

  const getTaskTypeIcon = (type) => {
    const iconProps = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" };
    switch (type) {
      case 'call': return <svg {...iconProps}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.88.36 1.74.7 2.56a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.82.34 1.68.57 2.56.7A2 2 0 0 1 22 16.92z"/></svg>;
      case 'email': return <svg {...iconProps}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
      case 'meeting': return <svg {...iconProps}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
      case 'quote': return <svg {...iconProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
      case 'follow_up': return <svg {...iconProps}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
      default: return <svg {...iconProps}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
    }
  };

  if (loading) {
    return (
      <div className="task-widget">
        <div className="widget-loading">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="task-widget">
      <div className="widget-header">
        <h3>My Tasks</h3>
        {onCreateTask && (
          <button className="btn btn-sm btn-primary" onClick={onCreateTask}>
            + New
          </button>
        )}
      </div>

      {/* Stats Bar */}
      <div className="task-stats">
        <div
          className={`stat-item ${activeTab === 'overdue' ? 'active' : ''} ${stats?.overdue > 0 ? 'alert' : ''}`}
          onClick={() => setActiveTab('overdue')}
        >
          <span className="stat-count">{stats?.overdue || 0}</span>
          <span className="stat-label">Overdue</span>
        </div>
        <div
          className={`stat-item ${activeTab === 'today' ? 'active' : ''}`}
          onClick={() => setActiveTab('today')}
        >
          <span className="stat-count">{stats?.dueToday || 0}</span>
          <span className="stat-label">Today</span>
        </div>
        <div
          className={`stat-item ${activeTab === 'upcoming' ? 'active' : ''}`}
          onClick={() => setActiveTab('upcoming')}
        >
          <span className="stat-count">{stats?.upcoming || 0}</span>
          <span className="stat-label">Upcoming</span>
        </div>
      </div>

      {/* Task List */}
      <div className="task-list">
        {getActiveTasks().length === 0 ? (
          <div className="empty-tasks">
            {activeTab === 'overdue' ? 'No overdue tasks' :
             activeTab === 'today' ? 'No tasks due today' :
             'No upcoming tasks'}
          </div>
        ) : (
          getActiveTasks().slice(0, 5).map(task => (
            <div key={task.id} className={`task-item priority-${task.priority}`}>
              <div className="task-check" onClick={(e) => handleCompleteTask(task.id, e)}>
                <div className="checkbox" style={{ borderColor: getPriorityColor(task.priority) }} />
              </div>
              <div className="task-content">
                <div className="task-title">
                  <span className="task-type-icon">{getTaskTypeIcon(task.task_type)}</span>
                  {task.title}
                </div>
                {task.related_lead_name && (
                  <div className="task-related">
                    Lead: {task.related_lead_name}
                  </div>
                )}
                <div className="task-meta">
                  {task.due_time && <span>{formatTime(task.due_time)}</span>}
                  {activeTab === 'upcoming' && task.due_date && (
                    <span>{formatDate(task.due_date)}</span>
                  )}
                  {task.isOverdue && <span className="overdue-badge">Overdue</span>}
                </div>
              </div>
              <div
                className="task-priority"
                style={{ background: getPriorityColor(task.priority) }}
              />
            </div>
          ))
        )}
      </div>

      {getActiveTasks().length > 5 && (
        <div className="view-all">
          <button className="btn btn-sm btn-link">View all {getActiveTasks().length} tasks</button>
        </div>
      )}

      <style>{`
        .task-widget {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .widget-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #e5e7eb;
        }
        .widget-header h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
        }
        .widget-loading {
          padding: 2rem;
          text-align: center;
          color: var(--text-secondary);
        }
        .task-stats {
          display: flex;
          border-bottom: 1px solid #e5e7eb;
        }
        .stat-item {
          flex: 1;
          padding: 0.75rem;
          text-align: center;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }
        .stat-item:hover {
          background: #f9fafb;
        }
        .stat-item.active {
          border-bottom-color: #3b82f6;
          background: #eff6ff;
        }
        .stat-item.alert .stat-count {
          color: #ef4444;
        }
        .stat-count {
          display: block;
          font-size: 1.5rem;
          font-weight: 700;
        }
        .stat-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        .task-list {
          max-height: 300px;
          overflow-y: auto;
        }
        .empty-tasks {
          padding: 2rem;
          text-align: center;
          color: var(--text-secondary);
          font-style: italic;
        }
        .task-item {
          display: flex;
          align-items: flex-start;
          padding: 0.75rem 1.25rem;
          border-bottom: 1px solid #f3f4f6;
          position: relative;
        }
        .task-item:hover {
          background: #f9fafb;
        }
        .task-check {
          padding: 0.25rem;
          cursor: pointer;
        }
        .checkbox {
          width: 18px;
          height: 18px;
          border: 2px solid #d1d5db;
          border-radius: 4px;
          transition: all 0.2s;
        }
        .checkbox:hover {
          background: #f3f4f6;
        }
        .task-content {
          flex: 1;
          margin-left: 0.75rem;
          min-width: 0;
        }
        .task-title {
          font-size: 0.9rem;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .task-type-icon {
          font-size: 0.8rem;
        }
        .task-related {
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
        }
        .task-meta {
          display: flex;
          gap: 0.75rem;
          font-size: 0.7rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
        }
        .overdue-badge {
          background: #fee2e2;
          color: #991b1b;
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
          font-weight: 600;
        }
        .task-priority {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
        }
        .view-all {
          padding: 0.75rem;
          text-align: center;
          border-top: 1px solid #e5e7eb;
        }
        .btn-link {
          background: none;
          border: none;
          color: #3b82f6;
          cursor: pointer;
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}

export default TaskWidget;
