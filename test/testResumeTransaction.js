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
});
