'use strict';

const tracer = require('dd-trace').init();
const { beginTracedTransaction } = require('../index');
const { expect, should } = require('chai');

describe('A function wrapped with beginTracedTransaction', function() {
    it('should have a new TraceId', async function() {
        const outsideSpan = tracer.scope().active();
        const outsideTraceId = outsideSpan.context().toTraceId();
        let insideTraceId;

        await beginTracedTransaction('test', async () => {
            const insideSpan = tracer.scope().active();
            insideTraceId = insideSpan.context().toTraceId();
        });

        expect(insideTraceId).to.not.equal(outsideTraceId);
    });

    it('should have a trxCorrelator', async function() {
        let propagatedTags;

        await beginTracedTransaction('test', async () => {
            const insideSpan = tracer.scope().active();
            propagatedTags = JSON.parse(insideSpan.getBaggageItem('x-tymegroup-propagated-tags'));
        });

        should().exist(propagatedTags);
        should().exist(propagatedTags['trx-correlator']);
        expect(propagatedTags['trx-correlator']).to.not.equal(null);
    });

    it('should possess provided propagated tags', async function() {
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

        should().exist(propagatedTags);
        should().exist(propagatedTags['test-tag']);
        expect(propagatedTags['test-tag']).to.equal('This is a test');

        should().exist(insideTags['test-tag']);
        expect(insideTags['test-tag']).to.equal('This is a test');
    });

    it('should possess provided tags without propagating them', async function() {
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

        should().exist(propagatedTags);
        should().not.exist(propagatedTags['test-tag']);

        should().exist(insideTags['test-tag']);
        expect(insideTags['test-tag']).to.equal('This is a test');
    });

    it('should possess the provided service.name', async () => {
        const serviceName = 'test-service';
        let insideServiceName;

        await beginTracedTransaction(serviceName, async () => {
            insideServiceName = tracer.scope().active().context()._tags['service.name'];
        });

        expect(serviceName).to.equal(insideServiceName);
    });

    it('should return the return value of the callback function', async () => {
        async function testfunc() {
            return 42;
        }

        const testval = await beginTracedTransaction('test-service', testfunc);

        expect(testval).to.equal(42);
    });
});
