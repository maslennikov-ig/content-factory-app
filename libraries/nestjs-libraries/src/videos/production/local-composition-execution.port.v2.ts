export const LOCAL_COMPOSITION_EXECUTION_V2=Symbol('LOCAL_COMPOSITION_EXECUTION_V2');
export interface LocalCompositionExecutionPortV2{start(organizationId:string,operationId:string,compositionId:string):Promise<void>}
