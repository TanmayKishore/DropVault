export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN';
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  data?: {
    user: User;
    accessToken: string;
  };
  error?: {
    message: string;
    details?: unknown;
  };
}

class AuthService {
  private accessToken: string | null = null;
  private currentUser: User | null = null;
  private listeners: Array<(user: User | null) => void> = [];
  private refreshPromise: Promise<boolean> | null = null;
  private isInitialized = false;

  private getApiUrl(): string {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  }

  public getAccessToken(): string | null {
    return this.accessToken;
  }

  public getUser(): User | null {
    return this.currentUser;
  }

  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  public subscribe(listener: (user: User | null) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(user: User | null): void {
    this.currentUser = user;
    this.isInitialized = true;
    this.listeners.forEach((listener) => listener(user));
  }

  public async register(email: string, password: string, name?: string): Promise<AuthResponse> {
    const res = await fetch(`${this.getApiUrl()}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Receive httpOnly refresh cookie
      body: JSON.stringify({ email, password, name }),
    });

    const data: AuthResponse = await res.json();
    if (res.ok && data.success && data.data) {
      this.accessToken = data.data.accessToken;
      this.notify(data.data.user);
    }
    return data;
  }

  public async login(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${this.getApiUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    const data: AuthResponse = await res.json();
    if (res.ok && data.success && data.data) {
      this.accessToken = data.data.accessToken;
      this.notify(data.data.user);
    }
    return data;
  }

  /**
   * Single-flight token refresh to prevent concurrent competing refresh calls.
   */
  public async refresh(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const res = await fetch(`${this.getApiUrl()}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });

        if (!res.ok) {
          this.accessToken = null;
          this.notify(null);
          return false;
        }

        const data: AuthResponse = await res.json();
        if (data.success && data.data) {
          this.accessToken = data.data.accessToken;
          this.notify(data.data.user);
          return true;
        }
        this.accessToken = null;
        this.notify(null);
        return false;
      } catch {
        this.accessToken = null;
        this.notify(null);
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  public async logout(): Promise<void> {
    try {
      await fetch(`${this.getApiUrl()}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } finally {
      this.accessToken = null;
      this.notify(null);
    }
  }

  public async fetchMe(): Promise<User | null> {
    if (!this.accessToken) {
      const refreshed = await this.refresh();
      if (!refreshed || !this.accessToken) {
        this.isInitialized = true;
        return null;
      }
    }

    try {
      const res = await fetch(`${this.getApiUrl()}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (res.status === 401) {
        const refreshed = await this.refresh();
        if (refreshed && this.accessToken) {
          const retryRes = await fetch(`${this.getApiUrl()}/api/auth/me`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.accessToken}`,
            },
          });
          if (retryRes.ok) {
            const data = await retryRes.json();
            if (data.success && data.data?.user) {
              this.notify(data.data.user);
              return data.data.user;
            }
          }
        }
        this.notify(null);
        return null;
      }

      if (!res.ok) {
        this.notify(null);
        return null;
      }

      const data = await res.json();
      if (data.success && data.data?.user) {
        this.notify(data.data.user);
        return data.data.user;
      }
      this.notify(null);
      return null;
    } catch {
      this.notify(null);
      return null;
    }
  }
}

export const auth = new AuthService();
