'use strict';

const rewire = require('rewire');
const tracer = require('dd-trace');
const tracedTransactions = rewire('../index');
const { beginTracedTransaction, resumeTracedTransaction, pickleActiveSpan } = tracedTransactions;
const { expect, should} = require('chai');

describe('A function wrapped with resumeTracedTransaction', function() {
    it('should have the same traceId as the beginning transaction', async function() {
        let pickle;
        let begunTraceId;
        let resumedTraceId;

        await beginTracedTransaction('test', async () => {
            begunTraceId = tracer.scope().active().context().toTraceId();
            pickle = pickleActiveSpan();
        });

        await resumeTracedTransaction(pickle, async() => {
            resumedTraceId = tracer.scope().active().context().toTraceId();
        })

        expect(begunTraceId).to.equal(resumedTraceId);
    });

    it('should simply call the callback if tracing is off', async () => {
        function alwaysFalse() {
            return false;
        }

        const originalFunction = tracedTransactions.__get__('_isTracerRunning');
        

        const outsideSpanId = tracer.scope().active().context()._spanId.toString(10);
        let insideSpanId;

        let pickle;
        await beginTracedTransaction('test-service', () => {
            pickle = pickleActiveSpan();
        });

        tracedTransactions.__set__('_isTracerRunning', alwaysFalse);

        try {
            await resumeTracedTransaction(null, () => {
                insideSpanId = tracer.scope().active().context()._spanId.toString(10);
            });
        }
        finally {
            tracedTransactions.__set__('_isTracerRunning', originalFunction);
        }

        expect(outsideSpanId).to.equal(insideSpanId);
    });

    it('should have a parent equal to the resumed span', async function() {
        let pickle;
        let begunSpanId;
        let resumedParentSpanId;

        await beginTracedTransaction('test', async () => {
            begunSpanId = tracer.scope().active().context()._spanId.toString(10);
            pickle = pickleActiveSpan();
        });

        await resumeTracedTransaction(pickle, async() => {
            resumedParentSpanId = tracer.scope().active().context()._parentId.toString(10);
        })

        expect(begunSpanId).to.equal(resumedParentSpanId);
    });

    it('should have the same trx-correlator as the beginning transaction', async function() {
        let pickle;
        let begunTrxCorrelator;
        let resumedTrxCorrelator;

        await beginTracedTransaction('test', async () => {
            const baggageItems = JSON.parse(tracer.scope().active().getBaggageItem('x-tymegroup-propagated-tags'));
            begunTrxCorrelator = baggageItems['trx-correlator'];

            pickle = pickleActiveSpan();
        });

        await resumeTracedTransaction(pickle, async() => {
            const baggageItems = JSON.parse(tracer.scope().active().getBaggageItem('x-tymegroup-propagated-tags'));
            resumedTrxCorrelator = baggageItems['trx-correlator'];
        })

        expect(begunTrxCorrelator).to.equal(resumedTrxCorrelator);
    });

    it('should have the same service.name as the beginning transaction', async function() {
        let pickle;
        let serviceName = 'resume-test-service-name';
        let resumedServiceName;

        await beginTracedTransaction(serviceName, async () => {
            pickle = pickleActiveSpan();
        });

        await resumeTracedTransaction(pickle, async() => {
            resumedServiceName = tracer.scope().active().context()._tags['service.name']
        })

        expect(serviceName).to.equal(resumedServiceName);
    });

    it('should have a different seg-correlator to the beginning transaction', async function() {
        let pickle;
        let begunTags;
        let resumedTags;

        await beginTracedTransaction('test', async () => {
            begunTags = tracer.scope().active().context()._tags;

            pickle = pickleActiveSpan();
        });

        await resumeTracedTransaction(pickle, async() => {
            resumedTags = tracer.scope().active().context()._tags;
        })

        should().exist(begunTags['seg-correlator']);
        should().exist(resumedTags['seg-correlator']);
        expect(begunTags['seg-correlator']).to.not.equal(resumedTags['seg-correlator']);
    });

    it('should silently pass through if there was no transaction', async function() {
        const outsideTraceId = tracer.scope().active().context().toTraceId();
        const outsideSpanId = tracer.scope().active().context().toSpanId();

        let insideTraceId;
        let insideSpanId;

        await resumeTracedTransaction(null, async() => {
            insideTraceId = tracer.scope().active().context().toTraceId();
            insideSpanId = tracer.scope().active().context().toSpanId();
        });

        expect(outsideTraceId).to.equal(insideTraceId);
        expect(outsideSpanId).to.equal(insideSpanId);
    });

    it('should do nothing if resuming a non-transaction', async function() {
        const firstTraceId = tracer.scope().active().context().toTraceId();
        let secondTraceId;
        let thirdTraceId;

        const pickle = pickleActiveSpan();
        const spanWrapper = tracer.startSpan('wrapper');
        
        try {
            await tracer.scope().activate(spanWrapper, async () => {
                secondTraceId = tracer.scope().active().context().toTraceId();

                await resumeTracedTransaction(pickle, async () => {
                    thirdTraceId = tracer.scope().active().context().toTraceId();
                });
            });
        }
        finally {
            spanWrapper.finish();
        }

        expect(thirdTraceId).to.equal(secondTraceId);
        expect(thirdTraceId).to.not.equal(firstTraceId);
    });

    it('should return the value of the callback function', async () => {
        let pickle;
        async function testfunc() {
            return 42;
        }

        await beginTracedTransaction('test-service', async () => {
            pickle = pickleActiveSpan();
        });

        const testval = await resumeTracedTransaction(pickle, testfunc);

        expect(testval).to.equal(42);
    });

    it('should continue an existing transaction if it is the same transaction', async () => {
        // I can't think of any way to test this apart from looking at the debugger
        let beginSpan;
        let resumeParentSpan;

        await beginTracedTransaction('test-service', async () => {
            const pickle = pickleActiveSpan();
            beginSpan = tracer.scope().active().context()._spanId.toString(10);

            await resumeTracedTransaction(pickle, async () => {
                resumeParentSpan = tracer.scope().active().context()._parentId.toString(10);
            });
        });

        expect(beginSpan).to.not.equal(resumeParentSpan);
    });

    it('should set the desired tags', async () => {
        let options = {
            tags: {
                'test-tag': 'test-value',
            },
        };

        let pickle;
        let resumedSpanTags;

        await beginTracedTransaction('test-service', async () => {
            pickle = pickleActiveSpan();
        });

        await resumeTracedTransaction(pickle, async () => {
            resumedSpanTags = tracer.scope().active().context()._tags;
        }, options);

        expect(resumedSpanTags['test-tag']).to.equal('test-value');
    });

    it('should do nothing if the pickle is null', async () => {
        const outsideSpanId = tracer.scope().active().context().toSpanId();
        let insideSpanId;

        const testval = await resumeTracedTransaction(null, async () => {
            insideSpanId = tracer.scope().active().context().toSpanId();
            return 42;
        });

        expect(outsideSpanId).to.equal(insideSpanId);
        expect(testval).to.equal(42);
    });
});
