'use strict';

const tracer = require('dd-trace').init();
const { beginTracedTransaction } = require('../index');
require('should');

describe('A function wrapped with beginTracedTransaction', function() {
    it('should have a new TraceId', async function() {
        const outsideSpan = tracer.scope().active();
        const outsideTraceId = outsideSpan.context().toTraceId();
        let insideTraceId;

        await beginTracedTransaction('test', async () => {
            const insideSpan = tracer.scope().active();
            insideTraceId = insideSpan.context().toTraceId();
        });

        should(insideTraceId).not.equal(outsideTraceId);
    });

    it('should have a trxCorrelator', async function() {
        const outsideSpan = tracer.scope().active();
        const outsideTraceId = outsideSpan.context().toTraceId();
        let propagatedTags;

        await beginTracedTransaction('test', async () => {
            const insideSpan = tracer.scope().active();
            propagatedTags = JSON.parse(insideSpan.getBaggageItem('x-tymegroup-propagated-tags'));
        });

        should.exist(propagatedTags);
        should.exist(propagatedTags['trx-correlator']);
        should(propagatedTags['trx-correlator']).not.equal(null);
    });

    it('should possess provided propagated tags', async function() {
        const outsideSpan = tracer.scope().active();
        const outsideTraceId = outsideSpan.context().toTraceId();
        const options = {
            propagatedTags: {
                'test-tag': 'This is a test'
            }
        }

        let propagatedTags;
        let insideTags;

        await beginTracedTransaction('test', async () => {
            const insideSpan = tracer.scope().active();
            insideTags = insideSpan._spanContext._tags;
            propagatedTags = JSON.parse(insideSpan.getBaggageItem('x-tymegroup-propagated-tags'));
        }, options);

        should.exist(propagatedTags);
        should.exist(propagatedTags['test-tag']);
        should(propagatedTags['test-tag']).equal('This is a test');

        should.exist(insideTags['test-tag']);
        should(insideTags['test-tag']).equal('This is a test');
    });

    it('should possess provided tags without propagating them', async function() {
        const outsideSpan = tracer.scope().active();
        const outsideTraceId = outsideSpan.context().toTraceId();
        const options = {
            tags: {
                'test-tag': 'This is a test'
            }
        }

        let propagatedTags;
        let insideTags;

        await beginTracedTransaction('test', async () => {
            const insideSpan = tracer.scope().active();
            insideTags = insideSpan._spanContext._tags;
            propagatedTags = JSON.parse(insideSpan.getBaggageItem('x-tymegroup-propagated-tags'));
        }, options);

        should.exist(propagatedTags);
        should.not.exist(propagatedTags['test-tag']);

        should.exist(insideTags['test-tag']);
        should(insideTags['test-tag']).equal('This is a test');
    });
});
