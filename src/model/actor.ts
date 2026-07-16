export type ActorRef =
  | {
      readonly type: 'human';
      readonly id: string;
    }
  | {
      readonly type: 'comet-agent';
      readonly id: string;
      readonly workflowId: string;
      readonly modelRef?: string;
    }
  | {
      readonly type: 'product-controller';
      readonly id: string;
    }
  | {
      readonly type: 'system';
      readonly id: string;
      readonly role: 'importer' | 'migration' | 'validator' | 'recovery';
    };
