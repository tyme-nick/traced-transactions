'use strict';

let tracer;
try {
    tracer = require('dd-trace');
}
catch (e) {
    console.error('dd-trace library not found');
    console.error('This library does not install dd-trace on its own');
    console.error('Please install dd-trace as a devDependency unless you are certain that production will not install its own');
    throw e;
}

const uuid = require('uuid');

const VENDOR_PREFIX = 'x-tymegroup-';
const PROPAGATED_TAGS_KEY = `${VENDOR_PREFIX}propagated-tags`;

/**
 * This function wraps a callback inside an orphaned trace
 */
async function beginTracedTransaction(serviceName, callback, options = {}) {
    if (! _isTracerRunning()) {
        return await callback();
    }

    const spanBootstrap = _generateTransactionBootstrap(serviceName, options);

    // the purpose of the wrapper span is to form a correlation between the active span and the newly created one
    // if we didn't have the wrapper, the possibility would exist that we could propagate the correlator everywhere
    return await tracer.trace(`transaction-bootstrap-wrapper-${serviceName}`, async (spanWrapper) => {
        try {
            return await tracer.scope().activate(spanBootstrap, async () => {
                _ensureBootstrapCorrelation(spanWrapper, spanBootstrap);
                return await callback();
            });
        }
        finally {
            spanBootstrap.finish();
        }
    });
}
exports.beginTracedTransaction = beginTracedTransaction;

async function resumeTracedTransaction(pickle, callback, options = {}) {
    if (! _isTracerRunning()) {
        return await callback();
    }

    const tags = options.tags ? options.tags : {};
    const segmentLabel = options.segmentLabel ? options.segmentLabel : 'default';
    let isTransactionExists = false;
    let parentSpanContext;
    let trxCorrelator;

    if (pickle) {
        parentSpanContext = _unpickleSpan(pickle);
        if (parentSpanContext) {
            if (pickle.trxCorrelator) {
                trxCorrelator = pickle.trxCorrelator;
                isTransactionExists = true;
            }
        }
    }

    // Just pass through silently if this wasn't part of a transaction
    if (! isTransactionExists) {
        return await callback();
    }

    return await tracer.trace(`transaction-segment-wrapper-${segmentLabel}`, async (spanWrapper) => {
        // If the wrapper sits inside the same transaction as the one we want to resume then don't disconnect from current trace
        const wrapperPropagatedTags = _getPropagatedTags(spanWrapper);
        if (wrapperPropagatedTags && 'trx-correlator' in wrapperPropagatedTags && wrapperPropagatedTags['trx-correlator'] == trxCorrelator) {
            parentSpanContext = spanWrapper;
        }

        return await tracer.trace(`transaction-segment-${segmentLabel}`, { childOf: parentSpanContext }, async (spanSegment) => {
            _propagateTags(spanSegment);
            _ensureSegmentCorrelation(spanSegment, spanWrapper);

            for (const key of Object.keys(tags)) {
                spanSegment.setTag(key, tags[key]);
            }
            spanSegment.setTag('resource.name', 'transaction-segment');
    
            return await callback();
        });
    });
}
exports.resumeTracedTransaction = resumeTracedTransaction;

function pickleActiveSpan() {
    if (! _isTracerRunning()) {
        return null;
    }

    const activeSpan = tracer.scope().active();
    const propagatedTags = _getPropagatedTags(activeSpan);
    const serviceName = 'service.name' in propagatedTags ? propagatedTags['service.name'] : null;
    const trxCorrelator = 'trx-correlator' in propagatedTags ? propagatedTags['trx-correlator'] : null;
    const pickle = {
        serviceName: serviceName,
        trxCorrelator: trxCorrelator,
        datadog: {},
    };
    tracer.inject(tracer.scope().active(), 'text_map', pickle.datadog);

    return pickle;
}
exports.pickleActiveSpan = pickleActiveSpan;

function _getPropagatedTags(spanSource) {
    const propagatedTagsBaggageItem = spanSource.getBaggageItem(PROPAGATED_TAGS_KEY);
    const propagatedTags = JSON.parse(propagatedTagsBaggageItem ? propagatedTagsBaggageItem : "{}");

    return propagatedTags;
}

function _unpickleSpan(pickle) {
    if (pickle && pickle.datadog) {
        return tracer.extract('text_map', pickle.datadog);
    }
    else {
        return null;
    }
}

function _propagateTags(spanTarget) {
    const propagatedTags = _getPropagatedTags(spanTarget);
    
    for (const tag of Object.keys(propagatedTags)) {
        spanTarget.setTag(tag, propagatedTags[tag]);
    }

    // this should really already be set
    if ('service.name' in propagatedTags) {
        spanTarget.setTag('service', propagatedTags['service.name']);
    }
}

function _ensureBootstrapCorrelation(spanWrapper, spanBootstrap) {
    const propagatedTagsWrapper = _getPropagatedTags(spanWrapper);
    const propagatedTagsBootstrap = _getPropagatedTags(spanBootstrap);

    // If the wrapper is in the context of another transaction then propagate that correlator
    let trx_correlator = 'trx-correlator' in propagatedTagsWrapper ? propagatedTagsWrapper['trx-correlator'] : uuid.v4();
    const seg_correlator = uuid.v4();

    spanWrapper.setTag('trx-correlator', trx_correlator);
    spanBootstrap.setTag('trx-correlator', trx_correlator);

    spanWrapper.setTag('seg-correlator', seg_correlator);
    spanBootstrap.setTag('seg-correlator', seg_correlator);

    propagatedTagsBootstrap['trx-correlator'] = trx_correlator;
    spanBootstrap.setBaggageItem(PROPAGATED_TAGS_KEY, JSON.stringify(propagatedTagsBootstrap));
}

function _ensureSegmentCorrelation(spanSegment, spanWrapper) {
    const propagatedTags = _getPropagatedTags(spanSegment)

    const trx_correlator = propagatedTags['trx-correlator']
    const seg_correlator = uuid.v4();

    if (! trx_correlator) {
        // This would be problematic but just don't do anything for now
        return;
    }

    spanWrapper.setTag('trx-correlator', trx_correlator);

    spanWrapper.setTag('seg-correlator', seg_correlator);
    spanSegment.setTag('seg-correlator', seg_correlator);
}

function _generateTransactionBootstrap(serviceName, options = {}) {
    const tags = options.tags ? options.tags : {};
    const propagatedTags = options.propagatedTags ? options.propagatedTags : {};
    const baggageItems = options.baggageItems ? options.baggageItems : {};
    
    const spanBootstrap = tracer.startSpan(`transaction-bootstrap-${serviceName}`);
    
    propagatedTags['service.name'] = serviceName;
    for (const key of Object.keys(propagatedTags)) {
        spanBootstrap.setTag(key, propagatedTags[key]);
    }

    for (const key of Object.keys(tags)) {
        spanBootstrap.setTag(key, tags[key]);
    }

    for (const key of Object.keys(baggageItems)) {
        spanBootstrap.setBaggageItem(key, baggageItems[key]);
    }

    // the following will be forced onto the span
    // - tag:service.name = serviceName
    // - tag:resource.name = 'transaction-bootstrap'
    // the service.name is set again here to override any sneakiness using tags

    spanBootstrap.setTag('service.name', serviceName);
    spanBootstrap.setTag('service', serviceName); // override Datadog on this one
    spanBootstrap.setTag('resource.name', 'transaction-bootstrap');
    
    const propagatedTagsString = JSON.stringify(propagatedTags);
    spanBootstrap.setBaggageItem(PROPAGATED_TAGS_KEY, propagatedTagsString);

    return spanBootstrap;
}

function _isTracerRunning() {
    const activeSpan = tracer.scope().active();

    return activeSpan ? true : false;
}
