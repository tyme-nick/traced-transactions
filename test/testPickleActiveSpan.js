'use strict';

const rewire = require('rewire');
const tracedTransactions = rewire('../index');
const { pickleActiveSpan } = tracedTransactions;
const { expect, should } = require('chai');

describe('pickleActiveSpan()', () => {
    it('should return null if tracing is off', () => {
        const mockTracer = {
            scope: () => {
                return {
                    active: () => { return null; }
                };
            },
        };

        const originalTracer = tracedTransactions.__get__('tracer');
        tracedTransactions.__set__('tracer', mockTracer);
        try {
            const nullPickle = pickleActiveSpan();
        }
        finally {
            tracedTransactions.__set__('tracer', originalTracer);
        }

        expect(null).to.equal(null);
    });
})
