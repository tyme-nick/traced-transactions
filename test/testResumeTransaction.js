'use strict';

const tracer = require('dd-trace').init();
const { beginTracedTransaction, resumeTracedTransaction, pickleActiveSpan } = require('../index');
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
});
