'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useEmployeeStore } from '@/hooks/use-employee-store';
import {
  DEPARTMENTS,
  EMPLOYMENT_TYPES,
  EMPLOYEE_STATUSES,
  GENDERS,
  DEPARTMENT_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYEE_STATUS_LABELS,
  GENDER_LABELS,
} from '@/types/employee';
import type { Department, EmploymentType, EmployeeStatus, Gender } from '@/types/employee';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const employeeFormSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(100),
  fatherName: z.string().min(1, 'Father name is required').max(100),
  gender: z.string().default('male'),
  dateOfBirth: z.string().optional().nullable(),
  phoneNumber: z.string().min(1, 'Phone number is required'),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  nationalId: z.string().optional().nullable(),
  jobTitle: z.string().min(1, 'Job title is required').max(100),
  department: z.enum(DEPARTMENTS, { required_error: 'Department is required' }),
  employmentType: z.enum(EMPLOYMENT_TYPES, { required_error: 'Employment type is required' }),
  salary: z.coerce.number().min(0, 'Salary must be positive'),
  hireDate: z.string().min(1, 'Hire date is required'),
  status: z.enum(EMPLOYEE_STATUSES, { required_error: 'Status is required' }),
  idImage: z.string().optional().nullable(),
  emergencyContactName: z.string().optional().nullable(),
  emergencyContactPhone: z.string().optional().nullable(),
});

type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

export function EmployeeForm() {
  const isFormOpen = useEmployeeStore((s) => s.isFormOpen);
  const editingEmployee = useEmployeeStore((s) => s.editingEmployee);
  const isLoading = useEmployeeStore((s) => s.isLoading);
  const closeForm = useEmployeeStore((s) => s.closeForm);
  const createEmployee = useEmployeeStore((s) => s.createEmployee);
  const updateEmployee = useEmployeeStore((s) => s.updateEmployee);

  const isEditing = !!editingEmployee;

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      fullName: '',
      fatherName: '',
      gender: 'male',
      dateOfBirth: '',
      phoneNumber: '',
      email: '',
      address: '',
      nationalId: '',
      jobTitle: '',
      department: undefined,
      employmentType: undefined,
      salary: 0,
      hireDate: format(new Date(), 'yyyy-MM-dd'),
      status: 'ACTIVE',
      idImage: null,
      emergencyContactName: '',
      emergencyContactPhone: '',
    },
  });

  useEffect(() => {
    if (isFormOpen) {
      if (editingEmployee) {
        form.reset({
          fullName: editingEmployee.fullName,
          fatherName: editingEmployee.fatherName,
          gender: editingEmployee.gender || 'male',
          dateOfBirth: editingEmployee.dateOfBirth
            ? format(new Date(editingEmployee.dateOfBirth), 'yyyy-MM-dd')
            : '',
          phoneNumber: editingEmployee.phoneNumber,
          email: editingEmployee.email ?? '',
          address: editingEmployee.address ?? '',
          nationalId: editingEmployee.nationalId ?? '',
          jobTitle: editingEmployee.jobTitle,
          department: editingEmployee.department as Department,
          employmentType: editingEmployee.employmentType as EmploymentType,
          salary: editingEmployee.salary,
          hireDate: editingEmployee.hireDate
            ? format(new Date(editingEmployee.hireDate), 'yyyy-MM-dd')
            : format(new Date(), 'yyyy-MM-dd'),
          status: editingEmployee.status as EmployeeStatus,
          emergencyContactName: editingEmployee.emergencyContactName ?? '',
          emergencyContactPhone: editingEmployee.emergencyContactPhone ?? '',
        });
      } else {
        form.reset({
          fullName: '',
          fatherName: '',
          gender: 'male',
          dateOfBirth: '',
          phoneNumber: '',
          email: '',
          address: '',
          nationalId: '',
          jobTitle: '',
          department: undefined,
          employmentType: undefined,
          salary: 0,
          hireDate: format(new Date(), 'yyyy-MM-dd'),
          status: 'ACTIVE',
          emergencyContactName: '',
          emergencyContactPhone: '',
        });
      }
    }
  }, [isFormOpen, editingEmployee, form]);

  async function onSubmit(values: EmployeeFormValues) {
    try {
      const data = {
        ...values,
        dateOfBirth: values.dateOfBirth || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
        nationalId: values.nationalId || undefined,
        emergencyContactName: values.emergencyContactName || undefined,
        emergencyContactPhone: values.emergencyContactPhone || undefined,
      };

      if (isEditing && editingEmployee) {
        await updateEmployee(editingEmployee.id, data);
        toast.success('Employee updated successfully');
      } else {
        await createEmployee(data as EmployeeFormValues);
        toast.success('Employee created successfully');
      }
    } catch {
      toast.error(isEditing ? 'Failed to update employee' : 'Failed to create employee');
    }
  }

  return (
    <Dialog open={isFormOpen} onOpenChange={(open) => !open && closeForm()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the employee details below.' : 'Fill in the details to add a new employee.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Row 1: Full Name + Father Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="fullName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl><Input placeholder="Enter full name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="fatherName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Father Name *</FormLabel>
                  <FormControl><Input placeholder="Enter father name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Row 2: Gender + DOB + Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="gender" render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Select gender" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {GENDERS.map((g) => (<SelectItem key={g} value={g}>{GENDER_LABELS[g]}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of Birth</FormLabel>
                  <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number *</FormLabel>
                  <FormControl><Input placeholder="e.g., +93 700 000 000" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Row 3: Email + National ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" placeholder="email@example.com" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="nationalId" render={({ field }) => (
                <FormItem>
                  <FormLabel>National ID / Tazkira</FormLabel>
                  <FormControl><Input placeholder="National ID number" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Row 4: Address */}
            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel>Address</FormLabel>
                <FormControl><Input placeholder="Enter address" {...field} value={field.value ?? ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Job Information</h3>
            </div>

            {/* Row 5: Job Title + Department */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="jobTitle" render={({ field }) => (
                <FormItem>
                  <FormLabel>Job Title / Position *</FormLabel>
                  <FormControl><Input placeholder="e.g., Site Engineer" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="department" render={({ field }) => (
                <FormItem>
                  <FormLabel>Department *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Select department" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => (<SelectItem key={d} value={d}>{DEPARTMENT_LABELS[d]}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Row 6: Employment Type + Status + Hire Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="employmentType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Employment Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {EMPLOYMENT_TYPES.map((t) => (<SelectItem key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {EMPLOYEE_STATUSES.map((s) => (<SelectItem key={s} value={s}>{EMPLOYEE_STATUS_LABELS[s]}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="hireDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Hire Date *</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Row 7: Salary */}
            <FormField control={form.control} name="salary" render={({ field }) => (
              <FormItem>
                <FormLabel>Base Salary</FormLabel>
                <FormControl>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Afs</span>
                    <Input type="number" step="0.01" min="0" placeholder="0.00" className="pl-7" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Emergency Contact</h3>
            </div>

            {/* Row 8: Emergency Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="emergencyContactName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Name</FormLabel>
                  <FormControl><Input placeholder="Emergency contact name" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="emergencyContactPhone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Phone</FormLabel>
                  <FormControl><Input placeholder="Emergency contact phone" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={closeForm} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Update Employee' : 'Add Employee'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
