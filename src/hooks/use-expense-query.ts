'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expensesApi } from '@/services/api';
import { useExpenseStore } from '@/hooks/use-expense-store';
import type { Expense, ExpenseFormData, ExpenseFilters } from '@/types/expense';

const EXPENSE_LIST_KEY = 'expenses' as const;

function buildListKey(
  filters: ExpenseFilters,
  page: number,
  pageSize: number,
  sortBy: string,
  sortOrder: string
) {
  return [EXPENSE_LIST_KEY, 'list', { ...filters, page, pageSize, sortBy, sortOrder }] as const;
}

export function useExpenses() {
  const filters = useExpenseStore((s) => s.filters);
  const pagination = useExpenseStore((s) => s.pagination);
  const sorting = useExpenseStore((s) => s.sorting);

  return useQuery({
    queryKey: buildListKey(filters, pagination.page, pagination.pageSize, sorting.sortBy, sorting.sortOrder),
    queryFn: async ({ signal }) => {
      const response = await expensesApi.getAll(
        {
          ...filters,
          page: pagination.page,
          pageSize: pagination.pageSize,
          sortBy: sorting.sortBy,
          sortOrder: sorting.sortOrder,
        },
        signal
      );
      if (!response.data) {
        throw new Error('No data returned');
      }
      return response.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ExpenseFormData) => expensesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EXPENSE_LIST_KEY] });
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ExpenseFormData> }) =>
      expensesApi.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: [EXPENSE_LIST_KEY] });
      const previousQueries = queryClient.getQueriesData({ queryKey: [EXPENSE_LIST_KEY] });

      queryClient.setQueriesData({ queryKey: [EXPENSE_LIST_KEY] }, (old: unknown) => {
        if (!old || typeof old !== 'object' || !('data' in (old as Record<string, unknown>))) return old;
        const paginated = old as { data: Expense[] };
        return {
          ...paginated,
          data: paginated.data.map((exp) =>
            exp.id === id ? { ...exp, ...data } : exp
          ),
        };
      });

      return { previousQueries };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousQueries) {
        for (const [key, data] of context.previousQueries) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [EXPENSE_LIST_KEY] });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [EXPENSE_LIST_KEY] });
      const previousQueries = queryClient.getQueriesData({ queryKey: [EXPENSE_LIST_KEY] });

      queryClient.setQueriesData({ queryKey: [EXPENSE_LIST_KEY] }, (old: unknown) => {
        if (!old || typeof old !== 'object' || !('data' in (old as Record<string, unknown>))) return old;
        const paginated = old as { data: Expense[] };
        return {
          ...paginated,
          data: paginated.data.filter((exp) => exp.id !== id),
        };
      });

      return { previousQueries };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousQueries) {
        for (const [key, data] of context.previousQueries) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [EXPENSE_LIST_KEY] });
    },
  });
}

export function useBulkDeleteExpenses() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => expensesApi.bulkDelete(ids),
    onMutate: async (ids) => {
      const idSet = new Set(ids);
      await queryClient.cancelQueries({ queryKey: [EXPENSE_LIST_KEY] });
      const previousQueries = queryClient.getQueriesData({ queryKey: [EXPENSE_LIST_KEY] });

      queryClient.setQueriesData({ queryKey: [EXPENSE_LIST_KEY] }, (old: unknown) => {
        if (!old || typeof old !== 'object' || !('data' in (old as Record<string, unknown>))) return old;
        const paginated = old as { data: Expense[] };
        return {
          ...paginated,
          data: paginated.data.filter((exp) => !idSet.has(exp.id)),
        };
      });

      return { previousQueries };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousQueries) {
        for (const [key, data] of context.previousQueries) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [EXPENSE_LIST_KEY] });
    },
  });
}
