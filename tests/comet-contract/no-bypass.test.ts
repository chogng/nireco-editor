import { describe, expect, it } from 'vitest';

import { MockCometIntegrationService } from '../../src/integration/comet/mock-service.js';

describe('Comet integration no-bypass surface', () => {
  it('does not expose raw transaction or review commit methods', () => {
    const methods = Object.getOwnPropertyNames(MockCometIntegrationService.prototype);

    expect(methods).not.toContain('applyRawTransaction');
    expect(methods).not.toContain('commitProposal');
    expect(methods).not.toContain('acceptProposalGroups');
    expect(methods).not.toContain('writeStorage');
  });
});
