'use client';

import * as React from 'react';
import { Wallet, Eye, EyeOff, Info, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useExpenseStore } from '@/hooks/use-expense-store';
import Image from 'next/image';

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
});

const registerSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Name is required')
      .min(2, 'Name must be at least 2 characters'),
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Please enter a valid email address'),
    password: z
      .string()
      .min(1, 'Password is required')
      .min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

// ─── Login Page Component ───────────────────────────────────────────────────

export function LoginPage() {
  const { login, register, isLoadingAuth } = useExpenseStore();
  const [showLoginPassword, setShowLoginPassword] = React.useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  // ─── Login Form ──────────────────────────────────────────────────────────

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onLoginSubmit = async (values: LoginFormValues) => {
    try {
      await login(values.email, values.password);
      toast.success('Welcome back!', {
        description: 'You have been signed in successfully.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      toast.error('Sign in failed', {
        description: message,
      });
    }
  };

  // ─── Register Form ───────────────────────────────────────────────────────

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onRegisterSubmit = async (values: RegisterFormValues) => {
    try {
      await register(values.email, values.name, values.password);
      toast.success('Account created!', {
        description: 'Your account has been created successfully.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      toast.error('Registration failed', {
        description: message,
      });
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950" />
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Decorative Blurs */}
      <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-600/10" />
      <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-teal-400/20 blur-3xl dark:bg-teal-600/10" />

      {/* Card */}
      <Card className="relative z-10 w-full max-w-md shadow-xl border-border/50 backdrop-blur-sm bg-card/95">
        <CardHeader className="space-y-3 text-center pb-2">
          {/* Logo */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/25">
            <Image
              src="/icon.png"
              alt="Yakhshi Ledger"
              className="h-full w-full object-contain"
              width={56}
              height={56}
            />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              Yakhshi Ledger
            </CardTitle>
            <CardDescription className="text-sm mt-1">
              Track & manage your expenses with ease
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" className="text-sm">
                Sign In
              </TabsTrigger>
              <TabsTrigger value="register" className="text-sm">
                Create Account
              </TabsTrigger>
            </TabsList>

            {/* ─── Login Tab ─────────────────────────────────────────── */}
            <TabsContent value="login" className="mt-5">
              <Form {...loginForm}>
                <form
                  onSubmit={loginForm.handleSubmit(onLoginSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="you@example.com"
                            autoComplete="email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showLoginPassword ? 'text' : 'password'}
                              placeholder="Enter your password"
                              autoComplete="current-password"
                              className="pr-10"
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setShowLoginPassword(!showLoginPassword)
                              }
                              tabIndex={-1}
                              aria-label={
                                showLoginPassword
                                  ? 'Hide password'
                                  : 'Show password'
                              }
                            >
                              {showLoginPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/25"
                    disabled={isLoadingAuth}
                  >
                    {isLoadingAuth ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </form>
              </Form>

              {/* Demo Credentials */}
              {/* <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-800/50 dark:bg-emerald-900/20">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="text-xs">
                  <p className="font-medium text-emerald-700 dark:text-emerald-300">
                    Demo Credentials
                  </p>
                  <p className="mt-0.5 text-emerald-600/80 dark:text-emerald-400/80">
                    Email: demo@yakhshiledger.com
                  </p>
                  <p className="text-emerald-600/80 dark:text-emerald-400/80">
                    Password: demo123
                  </p>
                </div>
              </div> */}
            </TabsContent>

            {/* ─── Register Tab ──────────────────────────────────────── */}
            <TabsContent value="register" className="mt-5">
              <Form {...registerForm}>
                <form
                  onSubmit={registerForm.handleSubmit(onRegisterSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={registerForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="John Doe"
                            autoComplete="name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="you@example.com"
                            autoComplete="email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showRegisterPassword ? 'text' : 'password'}
                              placeholder="Create a password"
                              autoComplete="new-password"
                              className="pr-10"
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setShowRegisterPassword(!showRegisterPassword)
                              }
                              tabIndex={-1}
                              aria-label={
                                showRegisterPassword
                                  ? 'Hide password'
                                  : 'Show password'
                              }
                            >
                              {showRegisterPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showConfirmPassword ? 'text' : 'password'}
                              placeholder="Confirm your password"
                              autoComplete="new-password"
                              className="pr-10"
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setShowConfirmPassword(!showConfirmPassword)
                              }
                              tabIndex={-1}
                              aria-label={
                                showConfirmPassword
                                  ? 'Hide password'
                                  : 'Show password'
                              }
                            >
                              {showConfirmPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/25"
                    disabled={isLoadingAuth}
                  >
                    {isLoadingAuth ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
