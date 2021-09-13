'use strict';

const tracer = require('dd-trace').init();
const { beginTracedTransaction, resumeTracedTransaction, pickleActiveSpan } = require('../index');
require('should');

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

        should(begunTraceId).equal(resumedTraceId);
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

        should(begunTrxCorrelator).equal(resumedTrxCorrelator);
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

        should(serviceName).equal(resumedServiceName);
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

        should.exist(begunTags['seg-correlator']);
        should.exist(resumedTags['seg-correlator']);
        should(begunTags['seg-correlator']).not.equal(resumedTags['seg-correlator']);
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

        should(outsideTraceId).equal(insideTraceId);
        should(outsideSpanId).equal(insideSpanId);
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

        should(thirdTraceId).equal(secondTraceId);
        should(thirdTraceId).not.equal(firstTraceId);
    });
});
