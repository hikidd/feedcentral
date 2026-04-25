'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRequireAdmin } from '@/lib/hooks/useAuth';
import { Users, Plus, Search, Shield, User as UserIcon, Mail, Calendar, Edit, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getIntlLocale } from '@/lib/locale';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
  avatar: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export default function UsersPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { user: currentUser, isLoading: authLoading } = useRequireAdmin();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'USER' as 'ADMIN' | 'USER',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (currentUser) {
      fetchUsers();
    }
  }, [currentUser]);

  async function fetchUsers() {
    try {
      setIsLoading(true);
      const startTime = Date.now();
      const response = await fetch('/api/admin/users');
      const data = await response.json();
      
      if (data.success) {
        setUsers(data.data);
      }

      // Ensure minimum loading time of 1 second for smoother UX
      const elapsed = Date.now() - startTime;
      const minLoadTime = 1000;
      if (elapsed < minLoadTime) {
        await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsed));
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleAddUser() {
    setEditingUser(null);
    setFormData({ name: '', email: '', password: '', role: 'USER' });
    setIsDialogOpen(true);
  }

  function handleEditUser(user: User) {
    setEditingUser(user);
    setFormData({ 
      name: user.name, 
      email: user.email, 
      password: '', 
      role: user.role 
    });
    setIsDialogOpen(true);
  }

  async function handleSaveUser() {
    setIsSaving(true);
    try {
      const url = editingUser 
        ? `/api/admin/users/${editingUser.id}` 
        : '/api/admin/users';
      
      const method = editingUser ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      
      if (data.success) {
        setIsDialogOpen(false);
        fetchUsers(); // Refresh the list
      } else {
        alert(data.error || t('admin.usersPage.saveFailed'));
      }
    } catch (error) {
      console.error('Failed to save user:', error);
      alert(t('admin.usersPage.genericError'));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm(t('admin.usersPage.deleteConfirm'))) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        fetchUsers(); // Refresh the list
      } else {
        alert(data.error || t('admin.usersPage.deleteFailed'));
      }
    } catch (error) {
      console.error('Failed to delete user:', error);
      alert(t('admin.usersPage.genericError'));
    }
  }

  if (authLoading || !currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">{t('admin.usersPage.loading')}</div>
      </div>
    );
  }

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background px-6 py-8 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {t('admin.usersPage.title')}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('admin.usersPage.subtitle')}
              </p>
            </div>
            <Button onClick={handleAddUser} className="gap-2">
              <Plus className="h-4 w-4" />
              {t('admin.usersPage.addUser')}
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('admin.usersPage.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-blue-500/10 p-2">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('admin.usersPage.stats.totalUsers')}</p>
                <p className="text-2xl font-bold text-foreground">{users.length}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-purple-500/10 p-2">
                <Shield className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('admin.usersPage.stats.admins')}</p>
                <p className="text-2xl font-bold text-foreground">
                  {users.filter(u => u.role === 'ADMIN').length}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-green-500/10 p-2">
                <UserIcon className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('admin.usersPage.stats.regularUsers')}</p>
                <p className="text-2xl font-bold text-foreground">
                  {users.filter(u => u.role === 'USER').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Users Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">{t('admin.usersPage.loadingUsers')}</div>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('admin.usersPage.table.user')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('admin.usersPage.table.role')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('admin.usersPage.table.created')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('admin.usersPage.table.lastLogin')}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('admin.usersPage.table.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-sm text-muted-foreground">
                        {t('admin.usersPage.noUsersFound')}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-muted/30">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                              <span className="text-sm font-medium text-primary">
                                {user.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{user.name}</p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              user.role === 'ADMIN'
                                ? 'bg-purple-500/10 text-purple-500'
                                : 'bg-blue-500/10 text-blue-500'
                            }`}
                          >
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString(getIntlLocale(locale))}
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {user.lastLoginAt
                            ? new Date(user.lastLoginAt).toLocaleDateString(getIntlLocale(locale))
                            : t('admin.usersPage.never')}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleEditUser(user)}
                              className="gap-2"
                            >
                              <Edit className="h-3 w-3" />
                              {t('admin.usersPage.edit')}
                            </Button>
                            {currentUser?.id !== user.id && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteUser(user.id)}
                                className="gap-2 text-red-500 hover:bg-red-500/10 hover:text-red-500"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Add/Edit User Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingUser ? t('admin.usersPage.dialog.editTitle') : t('admin.usersPage.dialog.addTitle')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('admin.usersPage.dialog.name')}</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Enter email"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Password {editingUser && '(leave blank to keep current)'}
                </label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={editingUser ? 'Leave blank to keep current' : 'Enter password'}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'USER' | 'ADMIN' })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  setEditingUser(null);
                  setFormData({ name: '', email: '', password: '', role: 'USER' });
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveUser}
                disabled={isSaving || !formData.name || !formData.email || (!editingUser && !formData.password)}
              >
                {isSaving ? 'Saving...' : editingUser ? 'Update' : 'Create'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
