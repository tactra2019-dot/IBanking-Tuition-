import { useQuery } from "@tanstack/react-query";
import { accountApi } from "../services/accountApi";
import { paymentApi } from "../services/paymentApi";
import type { Status } from "../types";
export const useAccount = () =>
  useQuery({ queryKey: ["account"], queryFn: accountApi.get });
export const usePayments = (page = 1, status: Status | "" = "") =>
  useQuery({
    queryKey: ["payments", page, status],
    queryFn: () => paymentApi.list(page, status),
  });
export const usePayment = (id: string) =>
  useQuery({
    queryKey: ["payment", id],
    queryFn: () => paymentApi.get(id),
    enabled: !!id,
    refetchInterval: (q) =>
      q.state.data?.status === "PROCESSING" ||
      q.state.data?.status === "PENDING"
        ? 5000
        : false,
  });
