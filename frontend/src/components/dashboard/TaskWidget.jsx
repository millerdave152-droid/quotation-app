/**
 * TaskWidget - Dashboard widget for tasks
 * Shows overdue, today, and upcoming tasks
 */

import React, { useState, useEffect } from 'react';
import api from '../../services/api';
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
    switch (type) {
      case 'call': return '📞';
      case 'email': return '📧';
      case 'meeting': return '📅';
      case 'quote': return '📄';
      case 'follow_up': return '🔔';
      default: return '📌';
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
