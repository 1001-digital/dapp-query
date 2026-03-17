import { App, InjectionKey } from 'vue';
import { QueryClient } from '../../core/dist';
export declare const QueryClientKey: InjectionKey<QueryClient>;
export declare function dappQueryPlugin(app: App, client: QueryClient): void;
export declare function useQueryClient(): QueryClient;
